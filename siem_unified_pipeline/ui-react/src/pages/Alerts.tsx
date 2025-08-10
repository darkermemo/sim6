export default function AlertsPage(){
  return (
    <div className="card">
      <h1>Alerts</h1>
      <form className="form-grid" onSubmit={(e)=>e.preventDefault()}>
        <label>Tenant<input placeholder="default" defaultValue="default"/></label>
        <label>Status<select defaultValue="OPEN"><option>OPEN</option><option>ACK</option><option>CLOSED</option></select></label>
        <div><button className="btn">Load</button></div>
      </form>
      <div style={{marginTop:12}}>No alerts loaded yet.</div>
    </div>
  )
}


