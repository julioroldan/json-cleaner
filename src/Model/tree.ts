export interface TreeNode {
    label: string;
    checked: boolean;
    isSheet: boolean;
    isArray:boolean;
    children?: TreeNode[];
  }