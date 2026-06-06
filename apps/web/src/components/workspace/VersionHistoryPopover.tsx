interface Props {
  onClose: () => void;
  onRestore: (desc: string) => void;
}

const VERSIONS = [
  ['Now','Current draft',true],
  ['2m ago','Generated carousel',false],
  ['5m ago','Approved plan',false],
  ['6m ago','Project created',false],
] as const;

export default function VersionHistoryPopover({ onRestore }: Props) {
  return (
    <div className="ver-pop">
      <div className="mh" style={{padding:'9px 10px 7px'}}>Version history</div>
      {VERSIONS.map(([t,d,now],i,a)=>(
        <div className="ver-item" key={i} onClick={()=>{onRestore(d);}}>
          <div className="tl"><span className={'pt'+(now?' now':'')} />{i<a.length-1&&<span className="ln" />}</div>
          <div className="tx"><b>{d}</b><span>{t}</span></div>
        </div>
      ))}
    </div>
  );
}
