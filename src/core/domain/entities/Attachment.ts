export interface Attachment {
  id: string;
  taskId: string;
  name: string;
  url: string;
  path: string;
  contentType?: string;
  size: number;
  createdAt: string;
}
