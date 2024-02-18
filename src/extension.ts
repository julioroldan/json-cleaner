// // The module 'vscode' contains the VS Code extensibility API
// // Import the module and reference it with the alias vscode in your code below
// import * as vscode from 'vscode';

// // This method is called when your extension is activated
// // Your extension is activated the very first time the command is executed
// export function activate(context: vscode.ExtensionContext) {

// 	// Use the console to output diagnostic information (console.log) and errors (console.error)
// 	// This line of code will only be executed once when your extension is activated
// 	console.log('Congratulations, your extension "json-cleaner" is now active!');

// 	// The command has been defined in the package.json file
// 	// Now provide the implementation of the command with registerCommand
// 	// The commandId parameter must match the command field in package.json
// 	let disposable = vscode.commands.registerCommand('json-cleaner.helloWorld', () => {
// 		// The code you place here will be executed every time your command is executed
// 		// Display a message box to the user
// 		vscode.window.showInformationMessage('Hello World from Json-Cleaner!');
// 	});

// 	context.subscriptions.push(disposable);
// }

// // This method is called when your extension is deactivated
// export function deactivate() {}
import * as vscode from 'vscode';
// import { ArbolView } from './arbolView';
import { CheckTreeDataProvider } from './CheckTreeDataProvider';
import { TreeNode }  from './Model/tree';

export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "test-hello" is now active!');
	// const activeEditor = vscode.window.activeTextEditor;
	// InitTree(context, activeEditor);
	vscode.window.onDidChangeActiveTextEditor((editor) => {
		return InitTree(context, editor);
	  });


	let disposable = vscode.commands.registerCommand('test-hello.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from test_hello!');
	});

	context.subscriptions.push(disposable);
}

function InitTree(context: vscode.ExtensionContext, editor?: vscode.TextEditor)
{
	if (editor) {
		  // Hay un archivo activo
		//   let treeNodes: TreeNode[];
		  let previewPanel: vscode.WebviewPanel | undefined;
		  const jsonContent = editor.document.getText();
		  const jsonData = parseJson(jsonContent);
		  const treeDataProvider = new CheckTreeDataProvider(jsonData);
		  const treeView = vscode.window.createTreeView('package-Arbol', { treeDataProvider });
		  treeDataProvider.refresh();
		  vscode.commands.registerCommand('extension.treeItemClicked', onTreeItemClicked);
		  const panel = vscode.window.createWebviewPanel(
			'previewPanel',
			'Vista Previa',
			vscode.ViewColumn.Two, // Puedes ajustar la ubicación de la vista previa
			{
			  enableScripts: true,
			}
		  );
		// treeNodes = treeDataProvider.getFull();
		  context.subscriptions.push(
			  vscode.commands.registerCommand('extension.refreshTreeView', () => {
				// treeNodes = treeDataProvider.getFull();
				openPreviewPanel(treeDataProvider.getFull(), panel);
			  })
		  );
		  
		//   vscode.commands.registerCommand('extension.treeItemClicked', onTreeDownRefresh);
		  context.subscriptions.push(
			  vscode.commands.registerCommand('extension.showMyTreeView', () => {
			  vscode.commands.executeCommand('workbench.view.extension.myTreeViewId');
			  })
		  );
		  
			  openPreviewPanel(treeDataProvider.getFull(), panel);
			//   const document = vscode.workspace.openTextDocument({
			// 	content: getNewText(treeNodes),
			// 	language: 'json',
			//   }).then((document: vscode.TextDocument) => {
			// 	vscode.window.showTextDocument(document).then((textEditor) => {
			// 		Utiliza el método 'edit' para realizar cambios en el documento
			// 		textEditor.edit((editBuilder) => {
			// 		  const newText = getNewText(treeNodes);
			// 		  const startPosition = new vscode.Position(0, 0);
			// 		  const endPosition = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
			// 		  const range = new vscode.Range(startPosition, endPosition);
				
			// 		  Reemplaza el contenido actual con el nuevo texto
			// 		  editBuilder.replace(range, newText);
			// 		});
			// 	  });
			//   });
		// Puedes realizar acciones adicionales aquí
	  } else {
		console.log('No hay archivo activo');
	  }
}
function getNewText(treeNodes:TreeNode[]):string
{
	const originalJson: TreeNode[] = treeNodes;
	const resultArray = convertJsonToResultObject(originalJson);
	const combinedResultObject: ResultObject = Object.assign({}, ...resultArray);
	return JSON.stringify(combinedResultObject, null, 2);
}
async function openPreviewPanel(treeNodes: TreeNode[], panel: vscode.WebviewPanel) {
	
	 
	  // Crea un nuevo panel webview para la vista previa
	  
	  const originalJson: TreeNode[] = treeNodes;
	  const resultArray = convertJsonToResultObject(originalJson);
	  
	  console.log(resultArray);
	 
	  const combinedResultObject: ResultObject = Object.assign({}, ...resultArray);
	  const resultJsonString = JSON.stringify(combinedResultObject, null, 2);
		panel.webview.html = getWebviewContent(resultJsonString);
	  // Crea un nuevo documento temporal con un contenido inicial
      

  }

  function getWebviewContent(document: string) {
	return `
	  <html>
		<body>
		  <pre>${document}</pre>
		  
		</body>
	  </html>
	`;
  }





  




  // FUNCIONES SI O SI 

  interface ResultObject {
	[key: string]: string;
  }
  
  function convertJsonToResultObject(json: TreeNode[]): ResultObject[] {
	const result: ResultObject[] = [];
  
	json.forEach((node) => {
	  if (node.children) {
		if (node.children.length> 0 && node.children[0].isSheet)
		{
			if (node.children[0].checked)
			{
				var resultadoHijo = node.children[0].label;
				const resultObject: ResultObject = {};
				processNode(node.label, resultadoHijo, resultObject);
				result.push(resultObject);
			}
		}
		else {
			const resultObject: ResultObject = {};
			const childResults = convertJsonToResultObject(node.children||[]);
			resultObject[node.label] = Object.assign({}, ...childResults); 
			result.push(resultObject);
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
	console.log(`clave ${key} y valor:${valor}`);
}
function refreshTree()
{
	const myCommand: vscode.Command = {
		command: 'extension.refreshTreeView',
		title: 'Refresh',
	  };
	vscode.commands.executeCommand(myCommand.command);
	// const myCommand2: vscode.Command = {
	// 	command: 'extension.refreshHTMLView',
	// 	title: 'Refresh',
	//   };
	// vscode.commands.executeCommand(myCommand2.command);
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
	refreshTree();
}
function onTreeItemClicked(node: TreeNode): void {

	if (!node.isSheet)
	{
		node.checked=!node.checked;
		onTreeDownRefresh(node);
		refreshTree();
	}
	// // Lógica para manejar el clic en un elemento del árbol
	console.log(`Clic en el nodo: ${node.label}, checked: ${node.checked}`);
	// // Realiza acciones adicionales según sea necesario
  }

function parseJson(json: string): TreeNode[] {
	try {
	  const parsedData = JSON.parse(json);
	  return convertToTreeNode(parsedData);
	} catch (error) {
	  vscode.window.showErrorMessage('Error al analizar el archivo JSON: ');
	  return [];
	}
  }
  
  function convertToTreeNode(data: any): TreeNode[] {
	if (Array.isArray(data)) {
	  return data.map((item, index) => ({
		label: index.toString(),
		checked: true, // Puedes ajustar esto según tus necesidades
		isSheet:false,
		isArray:false,
		children: convertToTreeNode(item),
	  }));
	} else if (typeof data === 'object' && data !== null) {
	  return Object.keys(data).map((key) => ({
		label: key,
		checked: true, // Puedes ajustar esto según tus necesidades
		isSheet:false,
		isArray:false,
		children: convertToTreeNode(data[key]),
	  }));
	} else {
	  return [
		{
		  label: data,
		  isSheet:true,
		  isArray:true,
		  checked: true, // Puedes ajustar esto según tus necesidades
		},
	  ];
	}
  }
// This method is called when your extension is deactivated
export function deactivate() {}
