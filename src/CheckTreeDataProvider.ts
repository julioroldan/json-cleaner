import * as vscode from 'vscode';
import { TreeNode }  from './Model/tree';


export class CheckTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private treeData: TreeNode[];

  constructor(treeData: TreeNode[]) {
    this.treeData = treeData;
  }
  public getFull(): TreeNode[]
  {
    return this.treeData;
  }
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  updateTreeDown(element: TreeNode, checked:boolean) {
    element.checked = checked;
     
  }
  getTreeItem(element: TreeNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label);
    treeItem.collapsibleState = element.children ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
if (element.isSheet)
{

  treeItem.iconPath = new vscode.ThemeIcon('symbol-text');
}
else  if (element.checked) {
      treeItem.iconPath = new vscode.ThemeIcon('pass-filled');
    } else {
      treeItem.iconPath = new vscode.ThemeIcon('circle-large-outline');
    }

    treeItem.command = {
      command: 'extension.treeItemClicked',
      title: 'hola',
      tooltip:"Seleccion",
      arguments: [element],
    };

    return treeItem;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    return element ? element.children || [] : this.treeData;
  }
}
