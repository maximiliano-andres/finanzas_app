const errorConfigs = {
    404: {
        title: 'Galería No Encontrada',
        message: 'La zona de excavación solicitada no existe o ha sido sellada. Verifica la ubicación e intenta de nuevo.',
        statusText: 'Galería Cerrada',
        actionBtn: 'Volver a Base',
        actionLink: '/flujopago/gestion-pagos/v1/',
        helpBtn: 'Contactar Supervisor',
        helpLink: 'mailto:supervisor@miningops.com',
        operationId: 'OP-404-NOTFOUND'
    },
    500: {
        title: 'Error en Operaciones',
        message: 'Se ha detectado un problema crítico en los sistemas de la mina. Equipo técnico en camino para restaurar las operaciones.',
        statusText: 'Operación Suspendida',
        actionBtn: 'Reportar Incidente',
        actionLink: 'mailto:incidents@miningops.com?subject=Error%20500%20Operaciones',
        helpBtn: 'Panel de Control',
        helpLink: '/flujopago/gestion-pagos/v1/dashboard',
        operationId: 'OP-500-CRITICAL'
    }
};

const renderError = (code) => {
    const config = errorConfigs[code] || errorConfigs[404];
    const container = document.getElementById('errorContainer');

    container.innerHTML = `
        <div class="header-line"></div>
        
        <div class="icon-wrapper">
            <svg class="pickaxe" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <!-- Mango del pico -->
                <rect x="55" y="30" width="10" height="70" rx="5" fill="url(#woodGradient)"/>
                <!-- Cabeza del pico (punta de oro) -->
                <path d="M 45 30 L 75 30 L 70 15 L 50 15 Z" fill="url(#oreGradient)" stroke="currentColor" stroke-width="1.5"/>
                <!-- Parte plana del pico -->
                <rect x="40" y="28" width="35" height="8" rx="2" fill="url(#copperGradient)" stroke="currentColor" stroke-width="1.5"/>
                
                <!-- Gradientes -->
                <defs>
                    <linearGradient id="oreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#c9a961;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#9d7e3a;stop-opacity:1" />
                    </linearGradient>
                    <linearGradient id="copperGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#b87333;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#8b5a2b;stop-opacity:1" />
                    </linearGradient>
                    <linearGradient id="woodGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#8b6f47;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#5d4e37;stop-opacity:1" />
                    </linearGradient>
                </defs>
            </svg>
            <div class="ore-particles">
                <div class="particle"></div>
                <div class="particle"></div>
                <div class="particle"></div>
                <div class="particle"></div>
                <div class="particle"></div>
            </div>
        </div>

        <div class="status-badge">${config.statusText}</div>
        
        <div class="error-code">${code}</div>
        <h1 class="error-title">${config.title}</h1>
        <p class="error-message">${config.message}</p>
        
        <div class="action-buttons">
            <a href="${config.actionLink}" class="btn-primary">${config.actionBtn}</a>
            <a href="${config.helpLink}" class="btn-secondary">${config.helpBtn}</a>
        </div>

        <div class="operation-details">
            📍 ID Operación: ${config.operationId} <br>
            ⏱️ Tiempo del Incidente: ${new Date().toLocaleString('es-ES')} <br>
            🔐 Contacta con Operaciones si persiste
        </div>
    `;
};

// Detectar código de error
const params = new URLSearchParams(window.location.search);
const errorCode = params.get('code') || 404;
renderError(parseInt(errorCode));
