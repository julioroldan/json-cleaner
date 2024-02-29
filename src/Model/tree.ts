import { v4 as uuidv4 } from 'uuid';

export class TreeNode {
  public readonly id: string;

  constructor(
    public label: string,
    public level: number,
    public isSheet: boolean,
    public isArray:boolean,
    public checked: boolean,
    public children: TreeNode[] = [],
    public parent: TreeNode | null = null
  ) {
    this.id = uuidv4();
  }
}
export interface ResultObject {
	[key: string]: string | string[];
  }