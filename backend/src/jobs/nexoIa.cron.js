const { crearRunnerNexo } = require('./nexoIa.runner');
const runner = crearRunnerNexo();
function initNexoIa(){ return runner.iniciar(); }
function despertarNexoIa(){ return runner.despertar(); }
function ciclo(){ return runner.mantenimiento(); }
module.exports={initNexoIa,despertarNexoIa,ciclo};
