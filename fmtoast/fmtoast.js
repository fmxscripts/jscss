class FMToast {

    // Definición de iconos como propiedad estática
    static #icons = {
        success: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
        error:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>`,
        warning: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
        info:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`
    };

    /**
     * Método principal estático para lanzar un toast
     * @param {Object} params - { icon, title, text, timer }
     */
    static fire(params) {
        const iconType = params.icon || 'info';
        const title = params.title || '';
        const text = params.text || '';
        const timer = params.timer || 3000;

        // Obtener valor del select o usar default
        const positionSelect = document.getElementById('positionSelect');
        const position = positionSelect ? positionSelect.value : 'top-end';

        // 1. Gestionar contenedor (Singleton por posición)
        const containerId = `swal-stack-${position}`;
        let container = document.getElementById(containerId);

        // Mapeo de posiciones
        const posMap = {
            'top-end': 'top-0 end-0',
            'top-start': 'top-0 start-0',
            'bottom-end': 'bottom-0 end-0',
            'bottom-start': 'bottom-0 start-0',
            'top-center': 'top-0 start-50 translate-middle-x',
            'bottom-center': 'bottom-0 start-50 translate-middle-x'
        };

        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.className = `toast-container position-fixed p-3 ${posMap[position] || 'top-0 end-0'}`;
            document.body.appendChild(container);
        }

        // 2. Crear HTML del Toast
        const el = document.createElement('div');
        el.className = 'toast swal-toast-clone align-items-center';
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'assertive');
        el.setAttribute('aria-atomic', 'true');

        // Acceso a la propiedad estática privada o pública
        const iconSvg = this.#icons[iconType] || this.#icons.info;

        el.innerHTML = `
            <div class="d-flex p-3">
                <div class="swal-icon icon-${iconType}">
                    ${iconSvg}
                </div>
                <div class="toast-body p-0 d-flex flex-column justify-content-center">
                    ${title ? `<span class="swal-title">${title}</span>` : ''}
                    ${text ? `<span class="small text-muted mt-1">${text}</span>` : ''}
                </div>
                <button type="button" class="btn-close btn-close-custom me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-progress-bar progress-${iconType}" style="animation-duration: ${timer}ms;"></div>
        `;

        // 3. Añadir al contenedor
        if (position.includes('top')) {
            container.prepend(el);
        } else {
            container.appendChild(el);
        }

        // 4. Inicializar Bootstrap Toast
        const bsToast = new bootstrap.Toast(el, {
            delay: timer,
            autohide: true
        });
        bsToast.show();

        // Limpieza
        el.addEventListener('hidden.bs.toast', () => {
            el.remove();
            if (container.children.length === 0) container.remove();
        });
    }
}