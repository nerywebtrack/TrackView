export interface Attachment {
  id: string;
  taskId: string;
  kind: "file" | "link";
  name: string;
  url: string;
  path: string;
  contentType?: string;
  size: number;
  createdAt: string;
}
