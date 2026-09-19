declare module 'html2canvas-pro' {
  interface Html2CanvasOptions {
    scale?: number;
    backgroundColor?: string | null;
    useCORS?: boolean;
    logging?: boolean;
    allowTaint?: boolean;
    width?: number;
    height?: number;
    windowWidth?: number;
    windowHeight?: number;
    scrollX?: number;
    scrollY?: number;
    x?: number;
    y?: number;
    onclone?: (clonedDoc: Document, element: HTMLElement) => void;
  }

  function html2canvas(element: HTMLElement, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
  export default html2canvas;
}
