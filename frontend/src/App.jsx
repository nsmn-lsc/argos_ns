import { useState, useEffect } from 'react';
import argusImage from './assets/images/argus.png';

function App() {
  const [metrics, setMetrics] = useState({
    cpu: { percentage_used: 0 },
    ram: { percentage_used: 0, used_gb: 0, total_gb: 0 }
  });
  const [isConnected, setIsConnected] = useState(false);
  
  // Projects State
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);

  // Deployment State
  const [deploying, setDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState(null);
  const [deployStatus, setDeployStatus] = useState(null);

  // Git State
  const [gitStatus, setGitStatus] = useState(null);
  const [fetchingGit, setFetchingGit] = useState(false);

  useEffect(() => {
    // 1. WebSocket Metrics
    
    const wsUrl = "wss://argos-ops.filenode.dev/ws/v1/metrics";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMetrics(data);
      } catch (e) {
        console.error("Error parsing metrics", e);
      }
    };

    // 2. Cargar lista de proyectos
    fetch("https://argos-ops.filenode.dev/api/v1/projects")
      .then(res => res.json())
      .then(data => {
        setProjects(data);
        if (data.length > 0) {
          setActiveProject(data[0]);
        }
      })
      .catch(e => console.error("Error cargando proyectos", e));

    return () => {
      ws.close();
    };
  }, []);

  // 3. Cargar Git Status cada vez que cambie el proyecto activo
  useEffect(() => {
    if (activeProject) {
      fetchGitStatus(activeProject);
      setDeployLogs(null);
      setDeployStatus(null);
    }
  }, [activeProject]);

  const fetchGitStatus = async (project) => {
    setFetchingGit(true);
    setGitStatus(null);
    try {
      const res = await fetch("https://argos-ops.filenode.dev/api/v1/git/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_path: project.repo_path })
      });
      if (res.ok) {
        const data = await res.json();
        setGitStatus(data);
      }
    } catch (e) {
      console.error("Failed to fetch git status", e);
    } finally {
      setFetchingGit(false);
    }
  };

  const handleDeploy = async () => {
    if(!activeProject) return;
    if(!confirm(`¿Iniciar despliegue automático de '${activeProject.name}'?`)) return;
    
    setDeploying(true);
    setDeployStatus("running");
    setDeployLogs([]);

    // Determinar opciones basadas en el tipo de proyecto
    const isDjango = activeProject.type === 'django';

    try {
      const res = await fetch("https://argos-ops.filenode.dev/api/v1/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_path: activeProject.repo_path,
          service_name: activeProject.service_name,
          run_migrations: isDjango, 
          install_requirements: isDjango,
          collect_static: isDjango
        })
      });
      const data = await res.json();
      setDeployStatus(data.status); // success o failed
      setDeployLogs(data.logs || []);
      
      // Actualizamos estado de git después de desplegar
      fetchGitStatus(activeProject);
    } catch (e) {
      setDeployStatus("failed");
      setDeployLogs([{ step: "network", status: "error", output: "Fallo de conexión con la API" }]);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4 relative z-0">
      {/* Marca de agua a pantalla completa */}
      <div 
        className="fixed inset-0 z-[-1] opacity-5 pointer-events-none bg-center bg-cover bg-no-repeat mix-blend-screen"
        style={{ backgroundImage: `url(${argusImage})` }}
      />
      
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-argus-accent to-blue-500 mb-2 drop-shadow-md">
          ArgusOps
        </h1>
        <p className="text-slate-400 font-light">Consola de Operaciones y Monitoreo</p>
      </header>

      <main className="w-full max-w-5xl flex flex-col gap-6">
        
        {/* Hardware Card (General) */}
        <section className="bg-argus-card rounded-2xl border border-slate-700/50 p-6 shadow-xl backdrop-blur-sm relative overflow-hidden transition-all hover:border-argus-accent/50 group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-argus-accent to-blue-600 rounded-2xl blur opacity-0 group-hover:opacity-10 transition duration-1000"></div>
          
          <div className="relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-argus-accent flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
                Servidor Global
              </h2>
              <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-900/80 border shadow-inner ${isConnected ? 'text-argus-ok border-argus-ok/30' : 'text-argus-crit border-argus-crit/30'}`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-argus-ok animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-argus-crit shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></div>
                {isConnected ? 'EN VIVO' : 'DESCONECTADO'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* CPU */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-slate-300 font-medium">Procesador</span>
                  <span className="font-mono text-lg">{metrics.cpu.percentage_used?.toFixed(1) || 0}%</span>
                </div>
                <div className="w-full bg-slate-900/80 rounded-full h-3 overflow-hidden border border-slate-700/50 shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ease-out relative ${metrics.cpu.percentage_used > 85 ? 'bg-gradient-to-r from-red-500 to-argus-crit' : metrics.cpu.percentage_used > 60 ? 'bg-gradient-to-r from-orange-400 to-argus-warn' : 'bg-gradient-to-r from-cyan-400 to-argus-accent'}`} 
                    style={{ width: `${metrics.cpu.percentage_used || 0}%` }}
                  ></div>
                </div>
              </div>

              {/* RAM */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-slate-300 font-medium">Memoria RAM</span>
                  <div className="flex items-end gap-3">
                    <span className="font-mono text-xs text-slate-500 mb-0.5">
                      {metrics.ram.used_gb || 0} / {metrics.ram.total_gb || 0} GB
                    </span>
                    <span className="font-mono text-lg">{metrics.ram.percentage_used?.toFixed(1) || 0}%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-900/80 rounded-full h-3 overflow-hidden border border-slate-700/50 shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ease-out relative ${metrics.ram.percentage_used > 85 ? 'bg-gradient-to-r from-red-500 to-argus-crit' : metrics.ram.percentage_used > 60 ? 'bg-gradient-to-r from-orange-400 to-argus-warn' : 'bg-gradient-to-r from-cyan-400 to-argus-accent'}`} 
                    style={{ width: `${metrics.ram.percentage_used || 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Separator / Salud Global */}
        <div className="flex items-center gap-4 my-2">
          <div className="h-px bg-slate-700/50 flex-1"></div>
          <span className="text-slate-500 text-sm uppercase tracking-widest font-semibold">Salud Global de Servicios</span>
          <div className="h-px bg-slate-700/50 flex-1"></div>
        </div>

        {/* Global Services Status */}
        {projects.length > 0 && (
          <section className="bg-argus-card/50 rounded-2xl border border-slate-700/30 p-5 shadow-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {projects.map((proj) => (
                <div key={proj.id} className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 flex flex-col justify-between hover:border-slate-600 transition-colors">
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-slate-300 truncate" title={proj.name}>{proj.name}</h3>
                    <p className="text-xs text-slate-500 font-mono truncate" title={proj.service_name}>{proj.service_name}</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400">Systemd</span>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      proj.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                      proj.status === 'unknown' ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20' : 
                      'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        proj.status === 'active' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 
                        proj.status === 'unknown' ? 'bg-slate-500' : 
                        'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]'
                      }`}></div>
                      {proj.status || 'inactive'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Separator / Context */}
        <div className="flex items-center gap-4 mt-6 mb-2">
          <div className="h-px bg-slate-700/50 flex-1"></div>
          <span className="text-slate-500 text-sm uppercase tracking-widest font-semibold">Administración de Proyectos</span>
          <div className="h-px bg-slate-700/50 flex-1"></div>
        </div>

        {/* Selector de Proyecto */}
        {projects.length > 0 && (
          <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700/30">
            <label className="text-slate-300 font-medium">Seleccionar Proyecto:</label>
            <select 
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-argus-accent focus:border-argus-accent block w-full p-2.5 outline-none flex-1"
              value={activeProject?.id || ''}
              onChange={(e) => {
                const proj = projects.find(p => p.id === e.target.value);
                setActiveProject(proj);
              }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
              ))}
            </select>
          </div>
        )}

        {/* Contexto del Proyecto Activo */}
        {activeProject && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Git Tracker Card */}
            <section className="bg-argus-card rounded-2xl border border-slate-700/50 p-6 shadow-xl backdrop-blur-sm relative overflow-hidden transition-all hover:border-argus-accent/50 group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-argus-accent rounded-2xl blur opacity-0 group-hover:opacity-10 transition duration-1000"></div>
              
              <div className="relative h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-argus-accent flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Git Tracker
                  </h2>
                  <button 
                    onClick={() => fetchGitStatus(activeProject)} 
                    disabled={fetchingGit}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${fetchingGit ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  {gitStatus ? (
                    <div className="space-y-5">
                      <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                        <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Rama Activa</p>
                        <p className="text-lg font-mono text-white flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.243 3.03a1 1 0 01.727 1.213L7.53 10.21l1.47 1.471a1 1 0 11-1.414 1.414L6.115 11.62l-1.47 1.47a1 1 0 01-1.415-1.414l1.47-1.471-1.47-1.47a1 1 0 111.415-1.414l1.47 1.47 2.44-5.968a1 1 0 011.214-.727z" clipRule="evenodd" />
                          </svg>
                          {gitStatus.active_branch}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 text-center">
                          <p className="text-xs text-slate-400 mb-1">Commits Behind</p>
                          <p className={`text-2xl font-mono ${gitStatus.commits_behind > 0 ? 'text-argus-warn' : 'text-slate-300'}`}>
                            {gitStatus.commits_behind}
                          </p>
                        </div>
                        <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 text-center">
                          <p className="text-xs text-slate-400 mb-1">Commits Ahead</p>
                          <p className={`text-2xl font-mono ${gitStatus.commits_ahead > 0 ? 'text-argus-accent' : 'text-slate-300'}`}>
                            {gitStatus.commits_ahead}
                          </p>
                        </div>
                      </div>

                      <div className={`p-3 rounded-xl border flex items-center gap-3 ${gitStatus.is_dirty ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${gitStatus.is_dirty ? 'bg-orange-500' : 'bg-emerald-500'}`}></div>
                        <span className="text-sm font-medium">
                          {gitStatus.is_dirty ? 'Cambios locales sin confirmar' : 'Directorio de trabajo limpio'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 py-8">
                      {fetchingGit ? (
                        <p className="animate-pulse">Inspeccionando repositorio...</p>
                      ) : (
                        <p>Información de Git no disponible</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
            
            {/* Deployment Card */}
            <section className="bg-argus-card rounded-2xl border border-slate-700/50 p-6 shadow-xl backdrop-blur-sm relative overflow-hidden flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-argus-accent flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Despliegue Guiado
                </h2>
                <div className="px-3 py-1 bg-slate-900/50 rounded-full border border-slate-700/50 text-xs text-slate-400 font-mono">
                  {activeProject.service_name}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center items-center py-4">
                <button 
                  onClick={handleDeploy}
                  disabled={deploying}
                  className={`px-6 py-3 rounded-xl font-medium tracking-wide transition-all shadow-lg flex items-center gap-3 ${
                    deploying 
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                      : 'bg-argus-accent hover:bg-cyan-400 text-slate-900 hover:shadow-cyan-500/25 active:scale-95'
                  }`}
                >
                  {deploying ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Ejecutando...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Desplegar Ahora
                    </>
                  )}
                </button>
                <p className="text-xs text-slate-500 mt-4 text-center max-w-xs">
                  {activeProject.type === 'django' 
                    ? 'Ejecutará git pull, migraciones, collectstatic y reiniciará Systemd.' 
                    : 'Ejecutará git pull y reiniciará Systemd.'}
                </p>
              </div>

              {/* Consola de Logs */}
              {deployStatus && (
                <div className="mt-4 bg-slate-900/80 border border-slate-700/50 rounded-lg overflow-hidden flex flex-col">
                  <div className="bg-slate-800/80 px-4 py-2 text-xs font-mono text-slate-400 border-b border-slate-700/50 flex justify-between">
                    <span>Terminal Output</span>
                    <span className={deployStatus === 'success' ? 'text-argus-ok' : deployStatus === 'failed' ? 'text-argus-crit' : 'text-argus-warn animate-pulse'}>
                      {deployStatus.toUpperCase()}
                    </span>
                  </div>
                  <div className="p-4 text-xs font-mono text-slate-300 max-h-48 overflow-y-auto space-y-2">
                    {deployLogs?.map((log, i) => (
                      <div key={i} className="flex flex-col border-l-2 pl-2 border-slate-700">
                        <span className="text-slate-500">[{log.step}]</span>
                        <span className={log.status === 'error' ? 'text-red-400' : 'text-slate-300'}>
                          {log.output || 'OK'}
                        </span>
                      </div>
                    ))}
                    {deployStatus === 'running' && <div className="text-argus-accent animate-pulse">_</div>}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
