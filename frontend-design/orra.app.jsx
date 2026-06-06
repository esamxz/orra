/* ORRA — root app */
function App() {
  const [screen, setScreen] = React.useState('dashboard');   // dashboard | workspace
  const [config, setConfig] = React.useState(null);

  const open = (cfg) => { setConfig(cfg); setScreen('workspace'); window.scrollTo(0,0); };
  const home = () => setScreen('dashboard');

  return (
    <div className="app">
      {screen==='dashboard'
        ? <Dashboard onOpen={open} />
        : <Workspace config={config} onHome={home} key={JSON.stringify(config)} />}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
