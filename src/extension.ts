import * as vscode from 'vscode';
import { CheckTreeDataProvider } from './CheckTreeDataProvider';
import { TreeNode, ResultObject } from './Model/tree';
import { v4 as uuidv4 } from 'uuid';

// Variables globales para gestión de recursos
let treeDataProvider: CheckTreeDataProvider | undefined;
let treeView: vscode.TreeView<TreeNode> | undefined;
let previewPanel: vscode.WebviewPanel | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

// Caché para guardar el estado del árbol por documento
const documentTreeCache = new Map<string, TreeNode[]>();
let currentDocumentUri: string | undefined;

export function activate(context: vscode.ExtensionContext) {
	// Guardar el contexto globalmente
	extensionContext = context;
	// Registrar comandos UNA SOLA VEZ
	registerCommands(context);
	
	// Inicializar con el editor activo
	if (vscode.window.activeTextEditor) {
		initializeExtension(context, vscode.window.activeTextEditor);
	}
	
	// Manejar cambios de editor activo
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor && editor.document.languageId === 'json') {
				initializeExtension(context, editor);
			}
		})
	);
	
	// Auto-refresh cuando cambia el contenido del documento JSON
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			const editor = vscode.window.activeTextEditor;
			if (editor && 
				event.document === editor.document && 
				event.document.languageId === 'json') {
				// Debounce para evitar actualizaciones excesivas
				debounceRefresh(context, editor);
			}
		})
	);
	
	// Limpiar cuando se cierra el documento
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			if (document.languageId === 'json') {
				// Limpiar del caché el documento cerrado
				const uri = document.uri.toString();
				documentTreeCache.delete(uri);
				
				// Si era el documento actual, limpiar referencias
				if (currentDocumentUri === uri) {
					currentDocumentUri = undefined;
					disposeResources();
				}
			}
		})
	);
}

// Debounce para el auto-refresh
let refreshTimeout: NodeJS.Timeout | undefined;
function debounceRefresh(context: vscode.ExtensionContext, editor: vscode.TextEditor) {
	if (refreshTimeout) {
		clearTimeout(refreshTimeout);
	}
	refreshTimeout = setTimeout(() => {
		// Validar que el JSON es parseable antes de actualizar
		try {
			JSON.parse(editor.document.getText());
			initializeExtension(context, editor);
		} catch {
			// JSON inválido, mantener el estado actual sin actualizar
			// Esto evita perder la selección durante edición o al descartar cambios
		}
	}, 500); // Espera 500ms después del último cambio
}

function registerCommands(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.treeItemClicked', onTreeItemClicked),
		vscode.commands.registerCommand('extension.refreshTreeView', handleRefreshTree),
		vscode.commands.registerCommand('extension.refreshCounsinTreeView', handleRefreshCousin),
		vscode.commands.registerCommand('nodeDependencies.newFile', handleNewFile),
		vscode.commands.registerCommand('nodeDependencies.togglePreview', handleTogglePreview)
	);
}

function initializeExtension(context: vscode.ExtensionContext, editor: vscode.TextEditor) {
	try {
		const jsonContent = editor.document.getText();
		const documentUri = editor.document.uri.toString();
		
		// Verificar si el URI del documento cambió
		const documentChanged = currentDocumentUri !== documentUri;
		if (documentChanged) {
			// Guardar el estado del documento anterior en el caché
			if (currentDocumentUri && treeDataProvider) {
				const currentTree = treeDataProvider.getFull();
				if (currentTree && currentTree.length > 0) {
					documentTreeCache.set(currentDocumentUri, cloneTree(currentTree));
				}
			}
			currentDocumentUri = documentUri;
		}
		
		const jsonData = parseJson(jsonContent);
		
		if (jsonData.length === 0) {
			// JSON inválido - intentar recuperar del caché
			if (documentTreeCache.has(documentUri)) {
				const cachedTree = documentTreeCache.get(documentUri)!;
				if (!treeDataProvider) {
					treeDataProvider = CheckTreeDataProvider.getInstance();
				}
				treeDataProvider.updateTree(cloneTree(cachedTree));
				
				if (!treeView) {
					treeView = vscode.window.createTreeView('package-Arbol', { 
						treeDataProvider, 
						showCollapseAll: true 
					});
					context.subscriptions.push(treeView);
				} else {
					treeDataProvider.refresh();
				}
				return;
			}
			
			// Si no hay árbol previo ni caché, mostrar warning solo la primera vez
			if (!treeDataProvider || treeDataProvider.getFull().length === 0) {
				vscode.window.showWarningMessage('No se pudo parsear el JSON');
			}
			return;
		}
		
		// Crear o actualizar TreeDataProvider
		if (!treeDataProvider) {
			treeDataProvider = CheckTreeDataProvider.getInstance();
			
			// Intentar restaurar del caché
			if (documentTreeCache.has(documentUri)) {
				const cachedTree = documentTreeCache.get(documentUri)!;
				preserveCheckedState(jsonData, cachedTree);
			}
			
			treeDataProvider.updateTree(jsonData);
		} else {
			// Preservar el estado checked antes de actualizar
			let oldTree = treeDataProvider.getFull();
			
			// Si cambió de documento, usar el caché
			if (documentChanged && documentTreeCache.has(documentUri)) {
				oldTree = documentTreeCache.get(documentUri)!;
			}
			
			preserveCheckedState(jsonData, oldTree);
			treeDataProvider.updateTree(jsonData);
		}
		
		// Guardar en caché el árbol actualizado
		documentTreeCache.set(documentUri, cloneTree(jsonData));
		
		// Crear TreeView solo si no existe
		if (!treeView) {
			treeView = vscode.window.createTreeView('package-Arbol', { 
				treeDataProvider, 
				showCollapseAll: true 
			});
			context.subscriptions.push(treeView);
		} else {
			// REFRESCAR el TreeView cuando ya existe
			treeDataProvider.refresh();
		}
		
		// Expandir raíz
		const root = treeDataProvider.getTreeInit();
		if (root) {
			treeView.reveal(root, { expand: 1 });
		}
		
		// Crear o actualizar panel de vista previa
		if (!previewPanel) {
			previewPanel = createPreviewPanel(context);
		}
		
		updatePreviewPanel(jsonData);
		
	} catch (error) {
		// En caso de error, mantener el estado actual
		console.error(`Error al inicializar: ${error}`);
	}
}

// Función para preservar el estado checked de los nodos
function preserveCheckedState(newTree: TreeNode[], oldTree: TreeNode[]) {
	if (!oldTree || oldTree.length === 0) {
		return;
	}
	
	// Crear un mapa del estado checked del árbol antiguo
	const checkedMap = new Map<string, boolean>();
	buildCheckedMap(oldTree, checkedMap);
	
	// Aplicar el estado al nuevo árbol
	applyCheckedState(newTree, checkedMap);
}

function buildCheckedMap(nodes: TreeNode[], map: Map<string, boolean>) {
	nodes.forEach(node => {
		// Usar label + level como key para identificar el nodo
		const key = `${node.label}_${node.level}`;
		map.set(key, node.checked);
		
		if (node.children && node.children.length > 0) {
			buildCheckedMap(node.children, map);
		}
	});
}

function applyCheckedState(nodes: TreeNode[], map: Map<string, boolean>) {
	nodes.forEach(node => {
		const key = `${node.label}_${node.level}`;
		if (map.has(key)) {
			node.checked = map.get(key)!;
		}
		
		if (node.children && node.children.length > 0) {
			applyCheckedState(node.children, map);
		}
	});
}

// Función para clonar profundamente el árbol
function cloneTree(nodes: TreeNode[]): TreeNode[] {
	return nodes.map(node => {
		const clonedNode: TreeNode = {
			label: node.label,
			level: node.level,
			isSheet: node.isSheet,
			isArray: node.isArray,
			checked: node.checked,
			id: node.id,
			value: node.value,
			children: node.children ? cloneTree(node.children) : [],
			parent: null // No clonar la referencia al padre para evitar referencias circulares
		};
		return clonedNode;
	});
}

function createPreviewPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
	const panel = vscode.window.createWebviewPanel(
		'previewPanel',
		'JSON Preview',
		vscode.ViewColumn.Two,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: []
		}
	);
	
	panel.webview.onDidReceiveMessage(
		async message => {
			switch (message.command) {
				case 'newFile':
					await handleNewFile();
					break;
			}
		},
		undefined,
		context.subscriptions
	);
	
	panel.onDidDispose(() => {
		previewPanel = undefined;
	}, null, context.subscriptions);
	
	return panel;
}

function disposeResources() {
	if (treeView) {
		treeView.dispose();
		treeView = undefined;
	}
	if (previewPanel) {
		previewPanel.dispose();
		previewPanel = undefined;
	}
}

// ============================================
// Funciones de manejo de comandos
// ============================================

function handleRefreshTree() {
	if (!treeDataProvider) { return; }
	
	treeDataProvider.refresh();
	const treeNodes = treeDataProvider.getFull();
	updatePreviewPanel(treeNodes);
}

function handleRefreshCousin(node: TreeNode) {
	if (!treeDataProvider) { return; }
	
	treeDataProvider.getLevelNodes(node);
	treeDataProvider.refresh();
}

async function handleNewFile() {
	if (!treeDataProvider) {
		vscode.window.showErrorMessage('No hay datos para crear archivo');
		return;
	}
	
	try {
		const content = treeNodesToString(treeDataProvider);
		const document = await vscode.workspace.openTextDocument({
			content,
			language: 'json',
		});
		
		await vscode.window.showTextDocument(document);
		
		// Formatear el documento
		await vscode.commands.executeCommand('editor.action.formatDocument');
		
	} catch (error) {
		vscode.window.showErrorMessage(`Error al crear archivo: ${error}`);
	}
}

function handleTogglePreview() {
	if (!previewPanel) {
		// Crear el panel si no existe
		if (!extensionContext) {
			vscode.window.showWarningMessage('Extensión no inicializada');
			return;
		}
		
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'json') {
			vscode.window.showWarningMessage('Abra un archivo JSON para ver el preview');
			return;
		}
		
		if (!treeDataProvider) {
			// Inicializar si es necesario
			initializeExtension(extensionContext, editor);
		} else {
			// Solo crear el panel
			previewPanel = createPreviewPanel(extensionContext);
			const treeNodes = treeDataProvider.getFull();
			updatePreviewPanel(treeNodes);
		}
	} else {
		// Cerrar el panel si existe
		previewPanel.dispose();
		previewPanel = undefined;
	}
}

// ============================================
// Funciones auxiliares
// ============================================

function treeNodesToString(provider: CheckTreeDataProvider): string {
	const originalJson: TreeNode[] = provider.getFull();
	const resultArray = convertJsonToResultObject(originalJson);
	
	// Combinar resultados
	let combinedResult: any;
	
	if (Array.isArray(resultArray) && resultArray.length > 0) {
		// Si es un array de objetos, combinarlos en un solo objeto
		if (resultArray.every((item: any) => typeof item === 'object' && !Array.isArray(item))) {
			combinedResult = Object.assign({}, ...resultArray);
		} else {
			combinedResult = resultArray;
		}
	} else {
		combinedResult = {};
	}
	
	return JSON.stringify(combinedResult, null, 2);
}

function updatePreviewPanel(treeNodes: TreeNode[]) {
	if (!previewPanel) { return; }
	
	try {
		// Detectar si el JSON raíz es un array
		const isRootArray = treeNodes.length > 0 && treeNodes[0]?.isArray;
		
		let combinedResult: any;
		
		if (isRootArray) {
			// Si es un array raíz, procesarlo como array
			const arrayResult = processArrayNode(treeNodes);
			combinedResult = arrayResult;
		} else {
			// Si es un objeto raíz, procesar normalmente
			const resultArray = convertJsonToResultObject(treeNodes);
			
			if (Array.isArray(resultArray) && resultArray.length > 0) {
				if (resultArray.every((item: any) => typeof item === 'object' && !Array.isArray(item))) {
					combinedResult = Object.assign({}, ...resultArray);
				} else {
					combinedResult = resultArray;
				}
			} else {
				combinedResult = {};
			}
		}
		
		const resultJsonString = JSON.stringify(combinedResult, null, 2);
		previewPanel.webview.html = getWebviewContent(resultJsonString);
	} catch (error) {
		console.error('Error actualizando preview:', error);
		previewPanel.webview.html = getWebviewContent('{}');
	}
}
 
  function getWebviewContent(document: string) {
	return `
	<!DOCTYPE html>
	<html lang="es">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<meta http-equiv="X-UA-Compatible" content="IE=edge">
		<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
		<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/10.7.2/highlight.min.js"></script>
		<style>
			body {
				padding: 20px;
			}
			#json-container {
				margin-top: 20px;
			}
			pre {
				background-color: #f5f5f5;
				padding: 15px;
				border-radius: 5px;
				overflow-x: auto;
			}
		</style>
	</head>
	<body>
		<div class="container">
			<div class="row justify-content-center mt-5">
				<div class="col-12">
					<table class="table">
						<tbody>
							<tr>
								<td class="text-center">
									<button type="button" onclick="copyContent()" id="btnModify" class="btn btn-primary">
										Copy clipboard
									</button>
								</td>
								<td class="text-center">
									<button type="button" id="btnCreateFile" onclick="callNewFile()" class="btn btn-success">
										New Document
									</button>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<div id="json-container"></div>
		
		<script type="application/json" id="jsonData">${document}</script>
		
		<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
		
		<script>
			const vscode = acquireVsCodeApi();
			
			function callNewFile() {
				vscode.postMessage({
					command: 'newFile',
					commandName: 'nodeDependencies.newFile'
				});
			}
			
			async function copyContent() {
				try {
					const texto = document.getElementById('jsonData').textContent;
					await navigator.clipboard.writeText(texto);
					
					// Feedback visual
					const btn = document.getElementById('btnModify');
					const originalText = btn.textContent;
					btn.textContent = 'Copied!';
					btn.classList.add('btn-success');
					btn.classList.remove('btn-primary');
					
					setTimeout(() => {
						btn.textContent = originalText;
						btn.classList.remove('btn-success');
						btn.classList.add('btn-primary');
					}, 2000);
				} catch (err) {
					console.error('Error al copiar:', err);
					alert('Error al copiar al portapapeles');
				}
			}
			
			// Renderizar JSON con highlight
			document.addEventListener('DOMContentLoaded', () => {
				const jsonDataElement = document.getElementById('jsonData');
				const jsonContainer = document.getElementById('json-container');
				
				if (jsonDataElement) {
					try {
						const jsonData = JSON.parse(jsonDataElement.textContent);
						jsonContainer.innerHTML = '<pre><code class="json">' + 
							JSON.stringify(jsonData, null, 4) + 
							'</code></pre>';
						hljs.highlightAll();
					} catch (error) {
						jsonContainer.innerHTML = '<div class="alert alert-danger">Error al parsear JSON</div>';
					}
				}
			});
		</script>
	</body>
	</html>
	`;
  }



  function convertJsonToResultObject(json: TreeNode[], isArrayContext: boolean = false): any {
	const result: any[] = [];
  
	json.forEach((node) => {
		if (!node.checked) {
			return; // Si el nodo no está marcado, saltarlo
		}
		
		// Caso 1: Nodo es hoja (primitivo)
		if (node.isSheet) {
			// Si estamos en contexto de array, retornar solo el valor sin key
			if (isArrayContext) {
				result.push(node.value !== undefined ? node.value : node.label);
			} else {
				// Si es un objeto, retornar como { key: value }
				result.push({ [node.label]: node.value !== undefined ? node.value : node.label });
			}
		}
		// Caso 2: Nodo tiene hijos
		else if (node.children && node.children.length > 0) {
			// Caso 2.1: Array de primitivos (nodo marcado como isArray y sus hijos son hojas)
			if (node.isArray && node.children[0]?.isSheet) {
				// Array de primitivos: filtrar solo los checked
				const primitiveArray = node.children
					.filter(child => child.checked)
					.map(child => child.value !== undefined ? child.value : child.label);
				result.push({ [node.label]: primitiveArray });
			}
			// Caso 2.2: Array de objetos (los hijos tienen isArray=true)
			else if (node.children[0]?.isArray) {
				const arrayElements = processArrayNode(node.children);
				result.push({ [node.label]: arrayElements });
			}
			// Caso 2.3: Objeto anidado
			else {
				const childResults = convertJsonToResultObject(node.children || [], false);
				// Si todos los hijos son objetos simples, combinarlos
				if (Array.isArray(childResults) && childResults.every((item: any) => typeof item === 'object')) {
					const combinedChild = Object.assign({}, ...childResults);
					result.push({ [node.label]: combinedChild });
				} else {
					result.push({ [node.label]: childResults });
				}
			}
		}
	});
  
	return result;
  }
  
  // Función para parsear valores y convertirlos a su tipo original
  function parseValue(value: string): any {
	// null
	if (value === 'null') {
		return null;
	}
	// boolean
	if (value === 'true') {
		return true;
	}
	if (value === 'false') {
		return false;
	}
	// number
	if (!isNaN(Number(value)) && value !== '') {
		return Number(value);
	}
	// string
	return value;
  }
  
  function processArrayNode(arrayNodes: TreeNode[]): any[] {
	return arrayNodes.map(node => {
		if (!node.checked) {
			return null; // Marcar para filtrar después
		}
		
		// Si el nodo tiene hijos
		if (node.children && node.children.length > 0) {
			// Verificar si es un array de primitivos:
			// - Tiene solo 1 hijo
			// - Ese hijo es una hoja (primitivo)
			const isSinglePrimitive = node.children.length === 1 && node.children[0]?.isSheet;
			
			if (isSinglePrimitive) {
				// Es un primitivo en el array - retornar solo el valor
				return node.children[0].value !== undefined ? node.children[0].value : node.children[0].label;
			} else {
				// Es un objeto en el array - combinar todos los hijos
				const childResults = convertJsonToResultObject(node.children, false);
				const combinedResult = Object.assign({}, ...childResults);
				
				// Verificar si el objeto está vacío
				if (Object.keys(combinedResult).length === 0) {
					return null; // Filtrar objetos vacíos
				}
				
				return combinedResult;
			}
		}
		
		return null;
	}).filter(item => item !== null); // Filtrar elementos no seleccionados y objetos vacíos
  }

function refreshTree() {
	vscode.commands.executeCommand('extension.refreshTreeView');
}

function updateCousinTree(node: TreeNode) {
	vscode.commands.executeCommand('extension.refreshCounsinTreeView', node);
}

function updateTreeDownArray(checked: boolean, elements: TreeNode[]) {
	elements?.forEach(element => {
		element.checked = checked;
		updateTreeDownArray(checked, element.children || []);
	});
}

function onTreeDownRefresh(node: TreeNode) {
	const checked = node.checked;
	updateTreeDownArray(checked, node.children || []);
}

function onTreeItemClicked(node: TreeNode): void {
	// Alternar el estado checked del nodo
	node.checked = !node.checked;
	
	// Si el nodo tiene hijos, propagar el cambio a todos sus descendientes
	if (!node.isSheet && node.children && node.children.length > 0) {
		onTreeDownRefresh(node);
	}
	
	// Actualizar nodos del mismo nivel (primos)
	updateCousinTree(node);
	
	// Refrescar la vista
	refreshTree();
	
	// Actualizar el caché con el nuevo estado
	if (currentDocumentUri && treeDataProvider) {
		const currentTree = treeDataProvider.getFull();
		documentTreeCache.set(currentDocumentUri, cloneTree(currentTree));
	}
}

function parseJson(json: string): TreeNode[] {
	if (!json || json.trim() === '') {
		return [];
	}
	
	try {
		const parsedData = JSON.parse(json);
		return convertToTreeNode(parsedData, 1);
	} catch (error) {
		// No mostrar error si ya hay un árbol cargado (evita errores molestos durante edición)
		// El error solo aparecerá si es la primera carga
		return [];
	}
}

function convertToTreeNode(
	data: any, 
	level: number, 
	parent: TreeNode | null = null
): TreeNode[] {
	const nextLevel = level + 1;
	
	// Caso: Array
	if (Array.isArray(data)) {
		return data.map((item, index) => {
			const node: TreeNode = {
				label: index.toString(),
				checked: true,
				id: uuidv4(),
				isSheet: false,
				isArray: true,
				parent,
				level,
				children: []
			};
			node.children = convertToTreeNode(item, nextLevel, node);
			return node;
		});
	}
	
	// Caso: Objeto
	if (typeof data === 'object' && data !== null) {
		return Object.entries(data).map(([key, value]) => {
			// Verificar si el valor es primitivo
			const isPrimitive = value === null || 
			                   typeof value === 'string' || 
			                   typeof value === 'number' || 
			                   typeof value === 'boolean';
			
			// Verificar si el valor es un array de primitivos
			const isPrimitiveArray = Array.isArray(value) && 
			                        value.length > 0 && 
			                        value.every((item: any) => 
			                            item === null || 
			                            typeof item === 'string' || 
			                            typeof item === 'number' || 
			                            typeof item === 'boolean'
			                        );
			
			const node: TreeNode = {
				label: key,
				id: uuidv4(),
				checked: true,
				isSheet: isPrimitive, // Marcar como hoja si es primitivo
				isArray: isPrimitiveArray, // Marcar como array si es array de primitivos
				parent,
				level,
				children: [],
				value: isPrimitive ? value : undefined // Guardar el valor si es primitivo
			};
			
			// Procesar hijos
			if (!isPrimitive) {
				if (isPrimitiveArray) {
					// Array de primitivos: crear nodos directos sin wrapper numérico
					node.children = value.map((item: any) => ({
						label: String(item),
						checked: true,
						id: uuidv4(),
						isSheet: true,
						isArray: false,
						parent: node,
						level: nextLevel,
						children: [],
						value: item
					}));
				} else {
					// Objeto o array de objetos: procesar normalmente
					node.children = convertToTreeNode(value, nextLevel, node);
				}
			}
			
			return node;
		});
	}
	
	// Caso: Primitivo directo (raro, pero posible)
	return [{
		label: String(data),
		isSheet: true,
		id: uuidv4(),
		children: [],
		parent,
		isArray: false,
		level,
		checked: true,
		value: data
	}];
}
// This method is called when your extension is deactivated
export function deactivate() {
	// Limpiar recursos al desactivar la extensión
	disposeResources();
}
