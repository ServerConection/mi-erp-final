const app = require('./app');

app.listen(process.env.PORT, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${process.env.PORT}`);
});
