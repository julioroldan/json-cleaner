import * as vscode from 'vscode';
import { TreeNode }  from './Model/tree';


export class CheckTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private static instance: CheckTreeDataProvider | null = null;
  private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;
  private clone(): CheckTreeDataProvider {
    return this;
  }
  static getInstance(): CheckTreeDataProvider {
    if (!CheckTreeDataProvider.instance) {
      CheckTreeDataProvider.instance = new CheckTreeDataProvider([]);
    }
    return CheckTreeDataProvider.instance;
  }

  private treeData: TreeNode[];

  private constructor(treeData: TreeNode[]) {
    this.treeData = treeData;
  }
  public updateTree(treeData: TreeNode[])
  {
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
  setTreeItem(id: string, checked:boolean)
  {
    let item = this.treeData.find(x => x.id === id);
    if (item)
      {item.checked = checked;}
    
  }
  getTreeInit(): TreeNode
  {
    return this.treeData[0];
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

  getParent(element: TreeNode): TreeNode | null {
    return element.parent;
  }
  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.treeData;
    }
    return element.children || [];
  }
  
  getLevelNodes(node: TreeNode): TreeNode[] {
    let level = node.level;
    let name = node.label;
    let check = node.checked;
    this.getFind(level, name, check,  this.treeData);

    return [];
  }
  getFind(level:number, name:string, check: boolean, children:TreeNode[]): TreeNode[]
  {
    children.forEach(item => {
      if (item.level<level)
      {

        this.getFind(level,name, check, item.children);
      }
      else
        {
          if (item.label === name && item.level === level)
          {
            item.checked = check;
          }
        }
    });
    return [];
  }
}
