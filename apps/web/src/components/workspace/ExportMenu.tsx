import { Icon } from '../../data/icons';

interface Props {
  isCarousel: boolean;
  cardCount: number;
  ratio: string;
  onClose: () => void;
  onFlash: (msg: string) => void;
  onExportPng?: () => Promise<void>;
}

export default function ExportMenu({ isCarousel, cardCount, ratio, onClose, onFlash, onExportPng }: Props) {
  return (
    <div className="menu-pop">
      <div className="mh">Export</div>
      <button className={'menu-item'+(isCarousel?' disabled':'')} onClick={async ()=>{ if(isCarousel) return; onClose(); if(!onExportPng){ onFlash('Exporting PNG…'); return; } onFlash('Exporting PNG…'); try{ await onExportPng(); onFlash('PNG exported'); }catch{ onFlash('Export failed'); } }}>
        <span className="ic">{<Icon.image s={17} />}</span>
        <span className="tx"><b>PNG image</b><span>{isCarousel?'Single posts only':'This post · '+ratio}</span></span>
      </button>
      <button className={'menu-item'+(!isCarousel?' disabled':'')} onClick={()=>{ if(!isCarousel) return; onClose(); onFlash('Bundling '+cardCount+' cards as ZIP…'); }}>
        <span className="ic">{<Icon.zip s={17} />}</span>
        <span className="tx"><b>ZIP archive</b><span>{isCarousel?cardCount+' cards · PNG each':'Carousel only'}</span></span>
      </button>
      <button className="menu-item" onClick={()=>{onClose();onFlash('Copied share link');}}>
        <span className="ic">{<Icon.brand s={17} />}</span>
        <span className="tx"><b>Copy share link</b><span>View-only preview</span></span>
      </button>
    </div>
  );
}
