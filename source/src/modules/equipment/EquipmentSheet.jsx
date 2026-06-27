import React, { useState } from 'react';
const types = [
  ['dry_van', 'Dry Van'], ['reefer', 'Reefer'], ['flatbed', 'Flatbed'],
  ['power_only', 'Power Only'], ['intermodal', 'Intermodal / Container'], ['bobtail', 'Bobtail / No Trailer'],
];
export default function EquipmentSheet({ equipment, onClose, onSave }) {
  const [type, setType] = useState(equipment?.type || 'intermodal');
  const [trailer, setTrailer] = useState(equipment?.trailer || '');
  const [chassis, setChassis] = useState(equipment?.chassis || '');
  const [container, setContainer] = useState(equipment?.container || '');
  const [seal, setSeal] = useState(equipment?.seal || '');
  const [rail, setRail] = useState(equipment?.rail || '');
  const [note, setNote] = useState(equipment?.note || '');
  function save() { onSave({ type, trailer, chassis, container, seal, rail, note }); }
  return (
    <div className="sheet active">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Equipment</div><span></span></div>
      <div className="form">
        <div className="form-section"><div className="form-label">Equipment type</div>
          <div className="equip-type-grid">
            {types.map(([id, label]) => <button key={id} className={type === id ? 'active' : ''} onClick={() => setType(id)}>{label}</button>)}
          </div>
        </div>
        {type === 'intermodal' ? (
          <>
            <div className="intermodal-info"><b>Intermodal</b><span>Chassis = equipment/trailer side. Container = load/shipping document side.</span></div>
            <div className="form-section"><div className="form-label">Chassis number</div><input value={chassis} onChange={e => setChassis(e.target.value.toUpperCase())} placeholder="e.g. CHZ123456" /></div>
            <div className="form-section"><div className="form-label">Container number</div><input value={container} onChange={e => setContainer(e.target.value.toUpperCase())} placeholder="e.g. MSKU1234567" /></div>
            <div className="two-inputs">
              <div className="form-section"><div className="form-label">Seal optional</div><input value={seal} onChange={e => setSeal(e.target.value.toUpperCase())} /></div>
              <div className="form-section"><div className="form-label">Rail / steamship</div><input value={rail} onChange={e => setRail(e.target.value)} /></div>
            </div>
          </>
        ) : type === 'bobtail' ? <div className="intermodal-info"><b>Bobtail / No Trailer</b><span>No equipment number required.</span></div>
        : <div className="form-section"><div className="form-label">Trailer number</div><input value={trailer} onChange={e => setTrailer(e.target.value.toUpperCase())} placeholder="Trailer number" /></div>}
        <div className="form-section"><div className="form-label">Note</div><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Yard, dock, pickup number, empty/loaded..." /></div>
        <button className="save-main" onClick={save}>Save equipment</button>
        <button className="cancel-main" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
