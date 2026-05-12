<template>
  <div class="coverage-checker">
    <!-- Header -->
    <div class="coverage-header">
      <h1>🗺️ Consulta de Cobertura de Internet</h1>
      <p>Verifica si una ubicación tiene cobertura</p>
      <div class="status-badge" :class="apiStatus">
        {{ apiStatus === 'online' ? '🟢 API Online' : '🔴 API Offline' }}
      </div>
    </div>

    <!-- Main Content -->
    <div class="coverage-content">
      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="coverage-form">
        <h2>📍 Coordenadas</h2>

        <div class="form-grid">
          <div class="form-group">
            <label>Latitud <span class="required">*</span></label>
            <input
              v-model.number="formData.latitude"
              type="number"
              placeholder="ej: -2.4189"
              step="0.0001"
              min="-90"
              max="90"
              required
            />
          </div>

          <div class="form-group">
            <label>Longitud <span class="required">*</span></label>
            <input
              v-model.number="formData.longitude"
              type="number"
              placeholder="ej: -79.3459"
              step="0.0001"
              min="-180"
              max="180"
              required
            />
          </div>
        </div>

        <button type="submit" :disabled="loading" class="btn-primary">
          <span v-if="!loading">🔍 Consultar Cobertura</span>
          <span v-else>⏳ Consultando...</span>
        </button>
      </form>

      <!-- Error Alert -->
      <div v-if="error" class="alert alert-error">
        ❌ {{ error }}
      </div>

      <!-- Result Card -->
      <div v-if="result" class="result-card" :class="{ 'has-coverage': result.hasCoverage }">
        <h3 class="result-title">
          {{ result.hasCoverage ? '✅ SÍ Tiene Cobertura' : '❌ NO Tiene Cobertura' }}
        </h3>

        <div class="result-grid">
          <div class="result-item">
            <span class="label">Latitud</span>
            <span class="value">{{ result.latitude.toFixed(4) }}</span>
          </div>
          <div class="result-item">
            <span class="label">Longitud</span>
            <span class="value">{{ result.longitude.toFixed(4) }}</span>
          </div>
          <div class="result-item">
            <span class="label">Zona</span>
            <span class="value">{{ result.zoneName }}</span>
          </div>
          <div class="result-item">
            <span class="label">Hora</span>
            <span class="value">{{ result.timestamp }}</span>
          </div>
        </div>
      </div>

      <!-- History Section -->
      <div v-if="history.length > 0" class="history-section">
        <div class="history-header">
          <h3>📋 Historial de Consultas ({{ history.length }})</h3>
          <div class="history-actions">
            <button @click="exportCSV" class="btn-secondary">⬇️ Descargar CSV</button>
            <button @click="clearHistory" class="btn-secondary">🗑️ Limpiar</button>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="history-table">
            <thead>
              <tr>
                <th>Latitud</th>
                <th>Longitud</th>
                <th>Cobertura</th>
                <th>Zona</th>
                <th>Fecha/Hora</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in history" :key="item.id" :class="{ 'row-coverage': item.hasCoverage }">
                <td>{{ item.latitude.toFixed(4) }}</td>
                <td>{{ item.longitude.toFixed(4) }}</td>
                <td>
                  <span class="badge" :class="{ 'badge-yes': item.hasCoverage, 'badge-no': !item.hasCoverage }">
                    {{ item.hasCoverage ? '✅ Sí' : '❌ No' }}
                  </span>
                </td>
                <td>{{ item.zoneName }}</td>
                <td>{{ item.timestamp }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Upload KML Section -->
      <div class="kml-section">
        <h3>📁 Cargar Archivo KML/KMZ</h3>
        <p class="subtitle">Carga un archivo KML o KMZ con las zonas de cobertura</p>

        <div class="upload-area" @dragover="dragover = true" @dragleave="dragover = false" @drop="handleDrop" :class="{ dragging: dragover }">
          <input
            ref="fileInput"
            type="file"
            @change="handleFileSelect"
            accept=".kml,.kmz"
            class="file-input"
          />
          <p>📤 Arrastra tu archivo aquí o haz clic para seleccionar</p>
          <small>Máximo 200 MB</small>
        </div>

        <button v-if="selectedFile" @click="uploadFile" :disabled="uploading" class="btn-secondary" style="margin-top: 15px;">
          <span v-if="!uploading">📤 Cargar {{ selectedFile.name }}</span>
          <span v-else>⏳ Subiendo...</span>
        </button>

        <div v-if="uploadMessage" class="alert" :class="uploadMessage.type === 'success' ? 'alert-success' : 'alert-error'">
          {{ uploadMessage.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CoverageChecker',
  data() {
    return {
      // Form
      formData: {
        latitude: null,
        longitude: null
      },

      // State
      loading: false,
      error: null,
      result: null,
      apiStatus: 'checking',
      history: [],

      // File upload
      selectedFile: null,
      uploading: false,
      dragover: false,
      uploadMessage: null
    };
  },

  computed: {
    apiUrl() {
      return `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/coverage`;
    }
  },

  methods: {
    /**
     * Verifica status de la API
     */
    async checkAPIStatus() {
      try {
        const response = await fetch(`${this.apiUrl}/status`);
        if (response.ok) {
          this.apiStatus = 'online';
        } else {
          this.apiStatus = 'offline';
        }
      } catch (error) {
        this.apiStatus = 'offline';
        console.warn('API no disponible');
      }
    },

    /**
     * Maneja el envío del formulario
     */
    async handleSubmit() {
      try {
        this.loading = true;
        this.error = null;

        const { latitude, longitude } = this.formData;

        // Validar
        if (!latitude || !longitude) {
          throw new Error('Ingresa coordenadas válidas');
        }

        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          throw new Error('Coordenadas fuera de rango válido');
        }

        // Consultar API
        const response = await fetch(
          `${this.apiUrl}/check?lat=${latitude}&lon=${longitude}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Error al consultar cobertura');
        }

        const data = await response.json();

        // Procesar resultado
        this.result = {
          latitude: data.latitude,
          longitude: data.longitude,
          hasCoverage: data.hasCoverage,
          zoneName: data.zoneName,
          timestamp: new Date(data.timestamp).toLocaleString('es-ES')
        };

        // Agregar al historial
        this.history.unshift({
          id: Date.now(),
          ...this.result
        });

        if (this.history.length > 100) {
          this.history.pop();
        }

        this.saveHistory();

      } catch (error) {
        this.error = error.message || 'Error desconocido';
        console.error(error);
      } finally {
        this.loading = false;
      }
    },

    /**
     * Maneja selección de archivo
     */
    handleFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        this.selectedFile = file;
        this.uploadMessage = null;
      }
    },

    /**
     * Maneja drop de archivo
     */
    handleDrop(event) {
      event.preventDefault();
      this.dragover = false;

      const file = event.dataTransfer.files[0];
      if (file && (file.name.endsWith('.kml') || file.name.endsWith('.kmz'))) {
        this.selectedFile = file;
        this.uploadMessage = null;
      }
    },

    /**
     * Carga el archivo a la API
     */
    async uploadFile() {
      try {
        if (!this.selectedFile) return;

        this.uploading = true;
        this.uploadMessage = null;

        const formData = new FormData();
        formData.append('file', this.selectedFile);

        const response = await fetch(`${this.apiUrl}/load`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Error al cargar archivo');
        }

        const data = await response.json();

        this.uploadMessage = {
          type: 'success',
          text: `✅ Se cargaron ${data.zonesLoaded} zonas exitosamente`
        };

        this.selectedFile = null;
        this.$refs.fileInput.value = '';

      } catch (error) {
        this.uploadMessage = {
          type: 'error',
          text: `❌ ${error.message}`
        };
        console.error(error);
      } finally {
        this.uploading = false;
      }
    },

    /**
     * Exporta historial a CSV
     */
    exportCSV() {
      if (this.history.length === 0) {
        this.error = 'No hay historial para descargar';
        return;
      }

      const headers = ['Latitud', 'Longitud', 'Cobertura', 'Zona', 'Fecha/Hora'];
      const rows = this.history.map(item => [
        item.latitude.toFixed(4),
        item.longitude.toFixed(4),
        item.hasCoverage ? 'Sí' : 'No',
        item.zoneName,
        item.timestamp
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cobertura-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    /**
     * Limpia el historial
     */
    clearHistory() {
      if (confirm('¿Estás seguro de que quieres limpiar el historial?')) {
        this.history = [];
        localStorage.removeItem('coverageHistory');
        this.error = '🗑️ Historial limpiado';
      }
    },

    /**
     * Guarda historial en localStorage
     */
    saveHistory() {
      try {
        localStorage.setItem('coverageHistory', JSON.stringify(this.history));
      } catch (e) {
        console.warn('No se pudo guardar en localStorage');
      }
    },

    /**
     * Carga historial desde localStorage
     */
    loadHistory() {
      try {
        const saved = localStorage.getItem('coverageHistory');
        if (saved) {
          this.history = JSON.parse(saved);
        }
      } catch (e) {
        console.warn('No se pudo cargar del localStorage');
      }
    }
  },

  mounted() {
    this.checkAPIStatus();
    this.loadHistory();

    // Revisar status cada 30 segundos
    setInterval(() => this.checkAPIStatus(), 30000);
  }
};
</script>

<style scoped lang="postcss">
.coverage-checker {
  @apply min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4;
}

.coverage-header {
  @apply max-w-4xl mx-auto mb-8 text-center;
}

.coverage-header h1 {
  @apply text-4xl font-bold text-gray-800 mb-2;
}

.coverage-header p {
  @apply text-gray-600 mb-4;
}

.status-badge {
  @apply inline-block px-4 py-2 rounded-full text-sm font-semibold;

  &.online {
    @apply bg-green-100 text-green-800;
  }

  &.offline {
    @apply bg-red-100 text-red-800;
  }

  &.checking {
    @apply bg-gray-100 text-gray-800;
  }
}

.coverage-content {
  @apply max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8 space-y-8;
}

.coverage-form {
  @apply bg-gray-50 rounded-lg p-6;
}

.coverage-form h2 {
  @apply text-xl font-semibold text-gray-800 mb-4;
}

.form-grid {
  @apply grid grid-cols-1 md:grid-cols-2 gap-4 mb-6;
}

.form-group {
  @apply flex flex-col;

  label {
    @apply block text-sm font-medium text-gray-700 mb-2;
  }

  input {
    @apply px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500;
  }
}

.required {
  @apply text-red-500;
}

.btn-primary {
  @apply w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:shadow-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-secondary {
  @apply px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
}

.alert {
  @apply p-4 rounded-lg border;

  &.alert-error {
    @apply bg-red-50 border-red-200 text-red-800;
  }

  &.alert-success {
    @apply bg-green-50 border-green-200 text-green-800;
  }
}

.result-card {
  @apply p-6 rounded-lg border-l-4;

  &.has-coverage {
    @apply bg-green-50 border-green-500;
  }

  &:not(.has-coverage) {
    @apply bg-red-50 border-red-500;
  }
}

.result-title {
  @apply text-2xl font-bold mb-4;

  .has-coverage & {
    @apply text-green-700;
  }

  &:not(.has-coverage) {
    @apply text-red-700;
  }
}

.result-grid {
  @apply grid grid-cols-2 md:grid-cols-4 gap-4;
}

.result-item {
  @apply flex flex-col bg-white rounded p-3;

  .label {
    @apply text-xs font-medium text-gray-600 mb-1;
  }

  .value {
    @apply text-lg font-semibold text-gray-800;
  }
}

.history-section {
  @apply mt-8 pt-8 border-t border-gray-200;
}

.history-header {
  @apply flex justify-between items-center mb-4 flex-wrap gap-4;

  h3 {
    @apply text-lg font-semibold text-gray-800;
  }
}

.history-actions {
  @apply flex gap-2;
}

.table-wrapper {
  @apply overflow-x-auto rounded-lg border border-gray-200;
}

.history-table {
  @apply w-full text-sm;

  thead {
    @apply bg-gray-100;

    th {
      @apply px-4 py-2 text-left font-semibold text-gray-700;
    }
  }

  tbody {
    tr {
      @apply border-t border-gray-200 hover:bg-gray-50;

      td {
        @apply px-4 py-3;
      }

      &.row-coverage {
        @apply bg-green-50;
      }
    }
  }
}

.badge {
  @apply inline-block px-3 py-1 rounded-full text-xs font-semibold;

  &.badge-yes {
    @apply bg-green-100 text-green-800;
  }

  &.badge-no {
    @apply bg-red-100 text-red-800;
  }
}

.kml-section {
  @apply mt-8 pt-8 border-t border-gray-200;

  h3 {
    @apply text-lg font-semibold text-gray-800 mb-2;
  }

  .subtitle {
    @apply text-sm text-gray-600 mb-4;
  }
}

.upload-area {
  @apply border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer transition duration-200;

  &.dragging {
    @apply border-blue-500 bg-blue-50;
  }

  &:hover {
    @apply border-blue-400 bg-blue-50;
  }

  input {
    @apply hidden;
  }

  p {
    @apply text-gray-700 font-medium mb-2;
  }

  small {
    @apply text-gray-500;
  }
}

@media (max-width: 768px) {
  .coverage-header h1 {
    @apply text-2xl;
  }

  .form-grid {
    @apply grid-cols-1;
  }

  .result-grid {
    @apply grid-cols-1;
  }

  .history-header {
    @apply flex-col items-start;
  }

  .history-actions {
    @apply flex-wrap;
  }
}
</style>
