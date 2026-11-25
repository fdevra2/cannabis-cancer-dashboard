export interface Tab {
  id: string;
  label: string;
  render: (root: HTMLElement) => void | Promise<void>;
}
