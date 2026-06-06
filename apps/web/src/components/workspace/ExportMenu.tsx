import { Icon } from '../../data/icons';

interface Props {
  isCarousel: boolean;
  cardCount: number;
  ratio: string;
  onClose: () => void;
  onFlash: (msg: string) => void;
}

export default function ExportMenu({ isCarousel, cardCount, ratio, onClose, onFlash }: Props) {
  return (
    <div className="menu-pop">
      <div className="mh">Export</div>
      <button className={'menu-item'+(isCarousel?' disabled':'')} onClick={()=>{ if(isCarousel) return; onClose(); onFlash('Exporting PNG…'); }}>
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
