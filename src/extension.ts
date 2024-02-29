import * as vscode from 'vscode';
import { CheckTreeDataProvider } from './CheckTreeDataProvider';
import { TreeNode, ResultObject } from './Model/tree';
import { v4 as uuidv4 } from 'uuid';

export function activate(context: vscode.ExtensionContext) {

	vscode.commands.registerCommand('extension.treeItemClicked', onTreeItemClicked);
			
	// InitTree(context, vscode.window.activeTextEditor);
	const panel = vscode.window.createWebviewPanel(
		'previewPanel',
		'Preview Panel',
		vscode.ViewColumn.Two, // Puedes ajustar la ubicación de la vista previa
		{
		  enableScripts: true,
		}
	  );
	  
	  panel.webview.onDidReceiveMessage(
		message => {
		  if (message.command === 'newFile') {
			vscode.commands.executeCommand(message.commandName);
		  }
		  if (message.command === 'updateDocument') {
			vscode.commands.executeCommand(message.commandName);
		  }
		  
		},
		undefined,
		context.subscriptions
	  );

	panel.webview.html = getWebviewContent("HOLA");
	 
	vscode.window.onDidChangeActiveTextEditor((editor) => {
		return InitTree(context, panel, editor);
	  });

}
function TreeNodesToString(treeDataProvider:CheckTreeDataProvider): string {
		const originalJson: TreeNode[] = treeDataProvider.getFull();
				const resultArray = convertJsonToResultObject(originalJson);
				const combinedResultObject: ResultObject = Object.assign([], ...resultArray);
				return JSON.stringify(combinedResultObject, null, 2);
}
function InitTree(context: vscode.ExtensionContext,panel: vscode.WebviewPanel, editor?: vscode.TextEditor)
{
	if (editor) {
		  let previewPanel: vscode.WebviewPanel | undefined;
		  const jsonContent = editor.document.getText();
		  const jsonData = parseJson(jsonContent);
		  const treeDataProvider = CheckTreeDataProvider.getInstance();
		  treeDataProvider.updateTree(jsonData);
		  const treeView = vscode.window.createTreeView('package-Arbol', { treeDataProvider , showCollapseAll: true }, );
		  const root = treeDataProvider.getTreeInit();  // Obtén el elemento raíz
			treeView.reveal(root, { expand: 1 });
		  context.subscriptions.push(
			vscode.commands.registerCommand('extension.refreshTreeView', () => {
			  treeDataProvider.refresh();
			  openPreviewPanel(context,treeDataProvider.getFull(), panel);
			})
		);
		context.subscriptions.push(
			vscode.commands.registerCommand('extension.refreshCounsinTreeView', (node:any) => {
			  treeDataProvider.getLevelNodes(node[0]);
			  treeDataProvider.refresh();
			})
		);
		context.subscriptions.push(
			vscode.commands.registerCommand('nodeDependencies.newFile', () => {
			  // Crea un nuevo documento temporal con un contenido inicial
			    
			  const document = vscode.workspace.openTextDocument({
				content: TreeNodesToString(treeDataProvider),
				language: 'json',
			  }).then((document: vscode.TextDocument) => {
				vscode.window.showTextDocument(document).then((textEditor) => {
					// Utiliza el método 'edit' para realizar cambios en el documento
					textEditor.edit((editBuilder) => {
					  const newText = TreeNodesToString(treeDataProvider);
					  const startPosition = new vscode.Position(0, 0);
					  const endPosition = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
					  const range = new vscode.Range(startPosition, endPosition);
				
					//   Reemplaza el contenido actual con el nuevo texto
					  editBuilder.replace(range, newText);
					});
				  });
			  });
			})
		);
		context.subscriptions.push(
			vscode.commands.registerCommand('nodeDependencies.updateDocument', () => {
			editor.edit((editBuilder) => {
				const startPosition = new vscode.Position(0, 0);
				const endPosition = new vscode.Position(editor.document.lineCount, 0);
				const range = new vscode.Range(startPosition, endPosition);
				editBuilder.replace(range, TreeNodesToString(treeDataProvider));
			  });
			})
		);
		context.subscriptions.push(
			vscode.commands.registerCommand('nodeDependencies.updateJson', () => {
				const jsonContent = editor.document.getText();
				const jsonData = parseJson(jsonContent);
				const treeDataProvider = CheckTreeDataProvider.getInstance();
				treeDataProvider.updateTree(jsonData);
			})
		);
		openPreviewPanel(context,jsonData, panel);
	  		
	  } else {
		console.log('empty file');
	  }
}
async function openPreviewPanel(context: vscode.ExtensionContext,treeNodes: TreeNode[], panel: vscode.WebviewPanel) {
	const originalJson: TreeNode[] = treeNodes;
	const resultArray = convertJsonToResultObject(originalJson);
	const combinedResultObject: ResultObject = Object.assign([], ...resultArray);
	const resultJsonString = JSON.stringify(combinedResultObject, null, 2);
	panel.webview.html = getWebviewContent(resultJsonString);

  }
 
  function getWebviewContent(document: string) {
	return `
	<html>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
    	<meta http-equiv="X-UA-Compatible" content="IE=edge">
		<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    	<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/10.7.2/highlight.min.js"></script>
		<script>hljs.initHighlightingOnLoad();</script>
		<body><div class="container ">
		<div class="row justify-content-center mt-5">
			<table class="table">
				<tbody>
					<tr>
						<td class="text-center">
							<button type="button" onclick="copyContent()" id="btnModify" class="btn btn-primary">Copy clipboard</button>
						</td>
						<td class="text-center">
							<button type="button" onclick="callUpdateFile()" class="btn btn-secondary">Update Document</button>
						</td>
						<td class="text-center">
							<button type="button" id="btnCreateFile" onclick="callNewFile()" class="btn btn-success">New Document</button>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>

	<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
	<div id="json-container"></div>
	<script type="application/json" id="jsonData">
    	${document}
	</script>
	<script>
        function callNewFile() {
            const vscode = acquireVsCodeApi();
			vscode.postMessage({
                        command: 'newFile',
                        commandName: 'nodeDependencies.newFile'
                    });
               
        }
		function callUpdateFile()
		{
			const vscode = acquireVsCodeApi();
			vscode.postMessage({
                        command: 'updateDocument',
                        commandName: 'nodeDependencies.updateDocument'
                    });
		}
    </script>
	<script>
	
		let texto = document.getElementById('jsonData').innerHTML;
		const copyContent = async () => {
			try {
			await navigator.clipboard.writeText(texto);
			
			} catch (err) {
			}
		}
</script>
<script>

    document.addEventListener('DOMContentLoaded', (event) => {
        const jsonDataElement = document.getElementById('jsonData');
        const jsonContainer = document.getElementById('json-container');
        
        if (jsonDataElement) {
            const jsonData = JSON.parse(jsonDataElement.textContent);
            jsonContainer.innerHTML = '<pre><code class="json">' + JSON.stringify(jsonData, null, 4) + '</code></pre>';
            hljs.highlightAll();
        }
    });
</script>
		</body>
	  </html>
	`;
  }



  function unificarNombresEnString(arr: TreeNode[]): string[] {
	const nombres: string[] = [];
	arr.forEach((node) => {
	  let fullValue = node.children[0].label;
	  nombres.push(fullValue);
	});
	return nombres;
  }
  
  function convertJsonToResultObject(json: TreeNode[]): ResultObject[] {
	const result: ResultObject[] = [];
  
	json.forEach((node) => {
	  if (node.children) {
		if (node.checked)
			{
		if (node.children[0]?.isArray)
		{
			const resultObject: ResultObject = {};
			let objetos = unificarNombresEnString(node.children);
			processNodeByArray(node.label,objetos,resultObject);
			result.push(resultObject);
		}
		else
		{

		if (node.children.length> 0 && node.children[0].isSheet)
		{
			if (node.checked)
			{
				var resultadoHijo = node.children[0].label;
				const resultObject: ResultObject = {};
				processNode(node.label, resultadoHijo, resultObject);
				result.push(resultObject);
			}
		}
		else {
			if (node.checked)
			{
			const resultObject: ResultObject = {};
			const childResults = convertJsonToResultObject(node.children||[]);
			resultObject[node.label] = Object.assign({}, ...childResults); 
			result.push(resultObject);
			}
		  }
		}
			}

		  
	  } else
	   {
		const childResults = convertJsonToResultObject(node.children||[]);
		result.push(...childResults);
	  }
	});
  
	return result;
  }
  function processNode(key: string,valor:string , resultObject: ResultObject): void {
	resultObject[key] = valor;
	// console.log(`clave ${key} y valor:${valor}`);
   }
   function processNodeByArray(key: string,valor:string[] , resultObject: ResultObject): void {
	resultObject[key] = valor;
	// console.log(`clave ${key} y valor:${valor}`);
   }
function refreshTree()
{
	const myCommand: vscode.Command = {
		command: 'extension.refreshTreeView',
		title: 'Refresh',
	  };
	vscode.commands.executeCommand(myCommand.command);
}
function updateCousinTree(node:TreeNode)
{
	const myCommand: vscode.Command = {
		command: 'extension.refreshCounsinTreeView',
		arguments:[node],
		title: 'update Cousing',
	  };
	vscode.commands.executeCommand(myCommand.command, myCommand.arguments);
}
function updateTreeDownArray(checked:boolean, elements: TreeNode[]) {
	  elements?.forEach(element => {
	    element.checked = checked;
	    updateTreeDownArray(checked, element.children || []);
	  });
	   
	}
function onTreeDownRefresh(node: TreeNode)
{
	var checked = node.checked;
	updateTreeDownArray(checked, node.children || []);
}

function onTreeItemClicked(node: TreeNode): void {

	if (!node.isSheet)
	{
		node.checked=!node.checked;
		onTreeDownRefresh(node);
		updateCousinTree(node);
		refreshTree();
	}
  }

function parseJson(json: string): TreeNode[] {
	try {
	  const parsedData = JSON.parse(json);
	  return convertToTreeNode(parsedData, 1);
	} catch (error) {
	  vscode.window.showErrorMessage('Error al analizar el archivo JSON: ');
	  return [];
	}
  }
  


  function convertToTreeNode(data: any, level:number, parent: TreeNode | null = null): TreeNode[] {
	let nextLevel = level +1;
	if (Array.isArray(data)) {
	  return data.map((item, index) => ({
		label: index.toString(),
		checked: true, 
		id:uuidv4(),
		isSheet:false,
		isArray:true,
		parent:parent,
		level:level,
		children: convertToTreeNode(item, nextLevel, parent),
	  }));
	} else if (typeof data === 'object' && data !== null) {
	  return Object.keys(data).map((key) => ({
		label: key,
		id:uuidv4(),
		checked: true, 
		isSheet:false,
		isArray:false,
		parent:parent,
		level:level,
		children: convertToTreeNode(data[key], nextLevel, parent),
	  }));
	} else {
	  return [
		{
		  label: data,
		  isSheet:true,
		  id:uuidv4(),
		  children:[],
		  parent:parent,
		  isArray:false,
		  level:level,
		  checked: true, 
		},
	  ];
	}
  }
// This method is called when your extension is deactivated
export function deactivate() {}
