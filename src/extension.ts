import * as vscode from 'vscode';
import { CheckTreeDataProvider } from './CheckTreeDataProvider';
import { TreeNode, ResultObject } from './Model/tree';
import { v4 as uuidv4 } from 'uuid';

// Variables globales para gestión de recursos
let treeDataProvider: CheckTreeDataProvider | undefined;
let treeView: vscode.TreeView<TreeNode> | undefined;
let previewPanel: vscode.WebviewPanel | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

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
				disposeResources();
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
		initializeExtension(context, editor);
	}, 500); // Espera 500ms después del último cambio
}

function registerCommands(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.treeItemClicked', onTreeItemClicked),
		vscode.commands.registerCommand('extension.refreshTreeView', handleRefreshTree),
		vscode.commands.registerCommand('extension.refreshCounsinTreeView', handleRefreshCousin),
		vscode.commands.registerCommand('nodeDependencies.newFile', handleNewFile),
		vscode.commands.registerCommand('nodeDependencies.updateDocument', handleUpdateDocument),
		vscode.commands.registerCommand('nodeDependencies.updateJson', handleUpdateJson),
		vscode.commands.registerCommand('nodeDependencies.togglePreview', handleTogglePreview)
	);
}

function initializeExtension(context: vscode.ExtensionContext, editor: vscode.TextEditor) {
	try {
		const jsonContent = editor.document.getText();
		const jsonData = parseJson(jsonContent);
		
		if (jsonData.length === 0) {
			vscode.window.showWarningMessage('No se pudo parsear el JSON');
			return;
		}
		
		// Crear o actualizar TreeDataProvider
		if (!treeDataProvider) {
			treeDataProvider = CheckTreeDataProvider.getInstance();
			treeDataProvider.updateTree(jsonData);
		} else {
			// Preservar el estado checked antes de actualizar
			const oldTree = treeDataProvider.getFull();
			preserveCheckedState(jsonData, oldTree);
			treeDataProvider.updateTree(jsonData);
		}
		
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
		vscode.window.showErrorMessage(`Error al inicializar: ${error}`);
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
				case 'updateDocument':
					await handleUpdateDocument();
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

async function handleUpdateDocument() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !treeDataProvider) {
		vscode.window.showWarningMessage('No hay editor activo');
		return;
	}
	
	try {
		const content = treeNodesToString(treeDataProvider);
		const success = await editor.edit((editBuilder) => {
			const document = editor.document;
			const fullRange = new vscode.Range(
				new vscode.Position(0, 0),
				new vscode.Position(document.lineCount, 0)
			);
			editBuilder.replace(fullRange, content);
		});
		
		if (success) {
			// Formatear el documento
			await vscode.commands.executeCommand('editor.action.formatDocument');
			vscode.window.showInformationMessage('Documento actualizado correctamente');
		}
		
	} catch (error) {
		vscode.window.showErrorMessage(`Error al actualizar documento: ${error}`);
	}
}

function handleUpdateJson() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || !treeDataProvider) { return; }
	
	const jsonContent = editor.document.getText();
	const jsonData = parseJson(jsonContent);
	treeDataProvider.updateTree(jsonData);
	updatePreviewPanel(jsonData);
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
		const resultArray = convertJsonToResultObject(treeNodes);
		
		// Combinar resultados
		let combinedResult: any;
		if (Array.isArray(resultArray) && resultArray.length > 0) {
			if (resultArray.every((item: any) => typeof item === 'object' && !Array.isArray(item))) {
				combinedResult = Object.assign({}, ...resultArray);
			} else {
				combinedResult = resultArray;
			}
		} else {
			combinedResult = {};
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
									<button type="button" onclick="callUpdateFile()" class="btn btn-secondary">
										Update Document
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
			
			function callUpdateFile() {
				vscode.postMessage({
					command: 'updateDocument',
					commandName: 'nodeDependencies.updateDocument'
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



  function convertJsonToResultObject(json: TreeNode[]): any {
	const result: any[] = [];
  
	json.forEach((node) => {
		if (!node.checked) {
			return; // Si el nodo no está marcado, saltarlo
		}
		
		// Caso 1: Nodo es hoja (primitivo) - usar el valor guardado
		if (node.isSheet) {
			result.push({ [node.label]: node.value !== undefined ? node.value : node.label });
		}
		// Caso 2: Nodo tiene hijos
		else if (node.children && node.children.length > 0) {
			// Caso 2.1: Array de elementos
			if (node.children[0]?.isArray) {
				const arrayElements = processArrayNode(node.children);
				result.push({ [node.label]: arrayElements });
			}
			// Caso 2.2: Objeto anidado
			else {
				const childResults = convertJsonToResultObject(node.children || []);
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
		
		// Si el nodo es una hoja (primitivo) - usar el valor guardado
		if (node.isSheet) {
			return node.value !== undefined ? node.value : node.label;
		}
		// Si el elemento del array es un objeto
		else if (node.children && node.children.length > 0) {
			const childResults = convertJsonToResultObject(node.children);
			return Object.assign({}, ...childResults);
		}
		return null;
	}).filter(item => item !== null); // Filtrar elementos no seleccionados
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
}

function parseJson(json: string): TreeNode[] {
	if (!json || json.trim() === '') {
		return [];
	}
	
	try {
		const parsedData = JSON.parse(json);
		return convertToTreeNode(parsedData, 1);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
		vscode.window.showErrorMessage(`Error al analizar JSON: ${errorMessage}`);
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
			
			const node: TreeNode = {
				label: key,
				id: uuidv4(),
				checked: true,
				isSheet: isPrimitive, // Marcar como hoja si es primitivo
				isArray: false,
				parent,
				level,
				children: [],
				value: isPrimitive ? value : undefined // Guardar el valor si es primitivo
			};
			
			// Solo procesar hijos si NO es primitivo
			if (!isPrimitive) {
				node.children = convertToTreeNode(value, nextLevel, node);
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
