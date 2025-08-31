const JSTableDefaultConfig = {
    perPage: 25,
    perPageSelect: [5, 10, 15, 20, 25],

    sortable: true,
    searchable: false,
    pagination: true,

    // Pagination
    nextPrev: true,
    firstLast: false,
    prevText: "&lsaquo;&lsaquo;",
    nextText: "&rsaquo;&rsaquo;",
    firstText: "&laquo;",
    lastText: "&raquo;",
    ellipsisText: "&hellip;",
    truncatePager: true,
    pagerDelta: 2,

    classes: {
        top: "dt-top",
        info: "dt-info",
        input: "dt-input",
        table: "dt-table",
        bottom: "dt-bottom",
        search: "dt-search",
        sorter: "dt-sorter",
        wrapper: "dt-wrapper",
        dropdown: "dt-dropdown",
        ellipsis: "dt-ellipsis",
        selector: "dt-selector",
        container: "dt-container",
        pagination: "dt-pagination",
        loading: "dt-loading",
        message: "dt-message"
    },

    // Display text
    labels: {
        placeholder: "Search...",
        perPage: "{select} entries per page",
        noRows: "...",
        info: "Showing {start} to {end} of {rows} entries",
        loading: "Loading...",
        infoFiltered: "Showing {start} to {end} of {rows} entries (filtered from {rowsTotal} entries)",
        error: "Error loading data"
    },

    layout: {
        // puedes personalizar el top si quieres agregar search, etc.
        top: "{perPage}{info}",
        bottom: "{pager}"
    },

    serverSide: true,
    ajax: null,
    ajaxParams: {},
    queryParams: {
        page: "page",
        search: "search"
    },

    addQueryParams: true,
    searchDelay: null, // ms
    rowAttributesCreator: null,
    method: "POST",
    colKeys: null,   // <— unificación de nombre
};

class JSTable {
    constructor(element, config = {}) {
        let DOMElement = element;
        if (typeof element === "string") {
            DOMElement = document.querySelector(element);
        }
        if (DOMElement === null) return;

        this.config = this._merge(JSTableDefaultConfig, config);
        // compat legacy
        if (!this.config.colKeys && this.config.colKeys) {
            this.config.colKeys = this.config.colKeys;
        }

        this.table = new JSTableElement(DOMElement);

        // estado
        this.currentPage = 1;
        this.columnRenderers = [];
        this.columnsNotSearchable = [];
        this.searchQuery = null;
        this.sortColumn = null;
        this.sortDirection = "asc";
        this.isSearching = false;
        this.filteredDataCount = null;
        this.totalDataCount = 0;
        this.response = null;
        this._abortController = null;

        // pager
        this.pager = new JSTablePager(this);

        // construir
        this._build();
        this._buildColumns();

        // primera actualización
        this.update(!this.config.serverSide);

        // eventos
        this._bindEvents();

        if (config.events) {
            for (let eKey in config.events) {
                this.on(eKey, config.events[eKey]);
            }
        }

        this._emit("init");

        this._parseQueryParams();
    }

    // ====== BUILD ======

    _build() {
        const options = this.config;

        this.wrapper = document.createElement("div");
        this.wrapper.className = options.classes.wrapper;

        // A11y
        this.table.element.setAttribute("role", "grid");
        this.table.element.classList.add(options.classes.table);

        let inner = [
            `<div class="${options.classes.top}"></div>`,
            `<div class="${options.classes.container}">`,
            `<div class="${options.classes.loading} hidden">${options.labels.loading}</div>`,
            `</div>`,
            `<div class="${options.classes.bottom}" ${!options.pagination ? "style='display:none'" : ""}>${options.layout.bottom}</div>`
        ].join("");

        // Pager placeholder
        inner = inner.replace("{pager}", `<div class="${options.classes.pagination}" ${!options.pagination ? "style='display:none'" : ""}></div>`);

        this.wrapper.innerHTML = inner;

        // reemplazar
        this.table.element.parentNode.replaceChild(this.wrapper, this.table.element);

        const container = this.wrapper.querySelector("." + options.classes.container);
        container.appendChild(this.table.element);

        // Top area (perPage + info)
        this._renderTop();

        // info placeholder si no existía
        let info = this.wrapper.querySelector("." + options.classes.info);
        if (!info) {
            info = document.createElement("div");
            info.className = options.classes.info;
            info.setAttribute("aria-live", "polite");
            info.setAttribute("role", "status");
            const top = this.wrapper.querySelector("." + options.classes.top);
            (top || this.wrapper).appendChild(info);
        }

        this._updatePagination();
        this._updateInfo();
    }

    _renderTop() {
        const { layout, classes } = this.config;
        const top = this.wrapper.querySelector("." + classes.top);
        if (!top) return;

        let html = layout.top || "";
        // Sustituye {perPage}
        if (html.includes("{perPage}")) {
            const node = this._createPerPageSelector();
            html = html.replace("{perPage}", node ? node.outerHTML : "");
            top.innerHTML = html;
            if (node) {
                top.querySelector("." + classes.dropdown)?.replaceWith(node);
            }
        } else {
            top.innerHTML = html;
        }

        // Inserta info si {info}
        if (html.includes("{info}")) {
            const info = document.createElement("div");
            info.className = classes.info;
            info.setAttribute("aria-live", "polite");
            info.setAttribute("role", "status");
            const placeholder = top.querySelector("." + classes.info);
            if (!placeholder) {
                // lugar final donde estaba {info} ya rendereado
                top.appendChild(info);
            }
        }
    }

    _createPerPageSelector() {
        const { classes, perPageSelect, labels } = this.config;
        if (!perPageSelect || !perPageSelect.length) return null;

        const wrap = document.createElement("div");
        wrap.className = classes.dropdown;

        const sel = document.createElement("select");
        sel.className = classes.selector;

        perPageSelect.forEach(n => {
            const opt = document.createElement("option");
            opt.value = String(n);
            opt.textContent = String(n);
            if (n === this.config.perPage) opt.selected = true;
            sel.appendChild(opt);
        });

        sel.addEventListener("change", () => {
            const val = parseInt(sel.value, 10);
            if (Number.isFinite(val) && val > 0) {
                this.config.perPage = val;
                this.resetPagination();
                this.update(true);
            }
        });

        // etiqueta (opcional)
        const label = document.createElement("label");
        label.className = classes.input;
        label.innerHTML = (labels.perPage || "{select}").replace("{select}", "");
        label.appendChild(sel);

        wrap.appendChild(label);
        return wrap;
    }

    setAjaxParams(params) {
        this.config.ajaxParams = Object.assign({}, this.config.ajaxParams, params);
    }

    resetPagination() {
        this.currentPage = 1;
    }

    // ====== UPDATE / RENDER ======

    async update(reloadData = true) {
        // ajustar página si cambió el total
        if (this.currentPage > this.pager.getPages()) {
            this.currentPage = this.pager.getPages();
        }

        // Crear Header (si existe)
        if (this.table.head && this.table.head.rows.length > 0) {
            const headerRow = this.table.head.rows[0];
            this.table.header.getCells().forEach((tableHeaderCell, columnIndex) => {
                const th = headerRow.cells[columnIndex];
                if (!th) return;
                th.innerHTML = tableHeaderCell.getInnerHTML();
                if (tableHeaderCell.classes.length > 0) th.className = tableHeaderCell.classes.join(" ");
                for (let attr in tableHeaderCell.attributes) th.setAttribute(attr, tableHeaderCell.attributes[attr]);
                th.setAttribute("data-sortable", tableHeaderCell.isSortable);
            });
        }

        if (reloadData) {
            return this.getPageData(this.currentPage)
                .then((rows) => {
                    this.table.element.classList.remove("hidden");
                    this.table.body.innerHTML = "";

                    rows.forEach((row, idx) => {
                        const tr = row.getFormatted(
                            this.columnRenderers,
                            this.config.rowAttributesCreator,
                            this.response?.data?.[idx]
                        );
                        this.table.body.appendChild(tr);
                    });
                })
                .then(() => {
                    if (this.getDataCount() <= 0) {
                        this.wrapper.classList.remove("search-results");
                        this.setMessage(this.config.labels.noRows);
                    }
                    this._emit("update");
                })
                .then(() => {
                    this._updatePagination();
                    this._updateInfo();
                });
        }
    }

    _updatePagination() {
        const pagination = this.wrapper.querySelector("." + this.config.classes.pagination);
        if (!pagination) return;
        pagination.innerHTML = "";
        pagination.appendChild(this.pager.render(this.currentPage));
    }

    _updateInfo() {
        const info = this.wrapper.querySelector("." + this.config.classes.info);
        const infoString = this.isSearching ? this.config.labels.infoFiltered : this.config.labels.info;
        if (info && infoString?.length) {
            const string = infoString
                .replace("{start}", this.getDataCount() > 0 ? this._getPageStartIndex() + 1 : 0)
                .replace("{end}", this._getPageEndIndex() + 1)
                .replace("{page}", this.currentPage)
                .replace("{pages}", this.pager.getPages())
                .replace("{rows}", this.getDataCount())
                .replace("{rowsTotal}", this.getDataCountTotal());
            info.innerHTML = string;
        }
    }

    _getPageStartIndex() {
        return (this.currentPage - 1) * this.config.perPage;
    }

    _getPageEndIndex() {
        const end = this.currentPage * this.config.perPage - 1;
        return end > this.getDataCount() - 1 ? this.getDataCount() - 1 : end;
    }

    _getData() {
        this._emit("getData", this.table.dataRows);
        return this.table.dataRows.filter(row => row.visible);
    }

    // ====== DATA (server/client) ======

    _setLoading(show) {
        const n = this.wrapper.querySelector("." + this.config.classes.loading);
        if (n) n.classList.toggle("hidden", !show);
    }

    _fetchData() {
        // Cancelar petición anterior
        if (this._abortController) this._abortController.abort();
        this._abortController = new AbortController();

        const { method = "POST", ajax, ajaxParams = {}, queryParams = {}, addQueryParams } = this.config;

        let params = {
            sortColumn: this.sortColumn,
            sortDirection: this.sortDirection,
            start: this._getPageStartIndex(),
            length: this.config.perPage,
            datatable: 1,
            ...ajaxParams
        };

        this._emit("before", this);
        this._setLoading(true);

        let url = ajax;
        const fetchInit = {
            method,
            headers: { Accept: "application/json" },
            signal: this._abortController.signal
        };

        if (String(method).toUpperCase() === "GET") {
            const usp = new URLSearchParams(params);
            if (addQueryParams) {
                if (this.currentPage != null && queryParams.page) usp.set(queryParams.page, String(this.currentPage));
                if (this.searchQuery && queryParams.search) usp.set(queryParams.search, this.searchQuery);
            }
            url += (url.includes("?") ? "&" : "?") + usp.toString();
        } else {
            fetchInit.headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
            const body = new URLSearchParams(Object.entries(params));
            fetchInit.body = body;
        }

        return fetch(url, fetchInit)
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(json => {
                this._emit("after", json);
                this._emit("fetchData", json);
                this.response = json;
                this.filteredDataCount = json.recordsFiltered ?? json.recordsTotal ?? 0;
                this.totalDataCount = json.recordsTotal ?? this.filteredDataCount ?? 0;

                const rows = [];
                (json.data || []).forEach(dataRow => {
                    rows.push(JSTableRow.createFromData(dataRow, this.config.colKeys));
                });
                return rows;
            })
            .catch(err => {
                if (err.name === "AbortError") return [];
                console.error(err);
                this.setMessage(this.config.labels?.error ?? "Error");
                return [];
            })
            .finally(() => this._setLoading(false));
    }

    getResponse() {
        return this.response;
    }

    getDataCount() {
        if (this.isSearching) return this.getDataCountFiltered();
        return this.getDataCountTotal();
    }

    getDataCountFiltered() {
        if (this.config.serverSide) return this.filteredDataCount ?? 0;
        return this._getData().length;
    }

    getDataCountTotal() {
        if (this.config.serverSide) return this.totalDataCount ?? 0;
        return this.table.dataRows.length;
    }

    getPageData() {
        if (this.config.serverSide) return this._fetchData();

        const start_idx = this._getPageStartIndex();
        const end_idx = this._getPageEndIndex();
        return Promise.resolve(this._getData()).then(data => {
            return data.filter((row, idx) => idx >= start_idx && idx <= end_idx);
        });
    }

    // ====== SORT / PAGINATE ======

    sort(column, direction, initial = false) {
        this.sortColumn = column ?? 0;
        this.sortDirection = direction;

        if (this.sortColumn < 0 || this.sortColumn > this.table.getColumnCount() - 1) return false;

        const rows = this.table.dataRows;
        const tableHeaderCells = this.table.header.getCells();
        tableHeaderCells.forEach((tableHeaderCell, idx) => {
            tableHeaderCell.removeClass("asc");
            tableHeaderCell.removeClass("desc");
            // limpiar aria-sort en TH reales
            const th = this.table.head?.rows?.[0]?.cells?.[idx];
            if (th) th.removeAttribute("aria-sort");
        });

        const node = this.table.header.getCell(this.sortColumn);
        node.addClass(this.sortDirection);

        // aria-sort al TH real
        const thNode = this.table.head?.rows?.[0]?.cells?.[this.sortColumn];
        if (thNode) thNode.setAttribute("aria-sort", this.sortDirection === "asc" ? "ascending" : "descending");

        if (!this.config.serverSide) {
            const dir = this.sortDirection === "asc" ? 1 : -1;
            const sorted = rows.slice().sort((a, b) => {
                let ca = a.getCellTextContent(this.sortColumn).toLowerCase();
                let cb = b.getCellTextContent(this.sortColumn).toLowerCase();

                ca = ca.replace(/(\$|,|\s|%)/g, "");
                cb = cb.replace(/(\$|,|\s|%)/g, "");

                const na = !isNaN(ca) && ca !== "" ? parseFloat(ca) : NaN;
                const nb = !isNaN(cb) && cb !== "" ? parseFloat(cb) : NaN;

                const aIsNum = !isNaN(na);
                const bIsNum = !isNaN(nb);

                // vacíos o tipos distintos al final/inicio
                if (ca === "" && cb !== "") return -dir;
                if (ca !== "" && cb === "") return dir;
                if (aIsNum && !bIsNum) return -dir;
                if (!aIsNum && bIsNum) return dir;

                if (aIsNum && bIsNum) {
                    if (na === nb) return 0;
                    return na > nb ? dir : -dir;
                } else {
                    if (ca === cb) return 0;
                    return ca > cb ? dir : -dir;
                }
            });

            this.table.dataRows = sorted;
        }

        // Si serverSide y es sort inicial, NO llama update
        if (!this.config.serverSide || !initial) {
            this.update();
        }

        this._emit("sort", this.sortColumn, this.sortDirection);
    }

    async paginate(new_page) {
        if (!this.pager.isValidPage(new_page)) return;
        this.currentPage = new_page;
        return this.update().then(() => {
            this._emit("paginate", this.currentPage, new_page);
        });
    }

    // ====== EVENTS ======

    _bindEvents() {
        this._handleWrapperClick = (event) => {
            const pageLink = event.target.closest("[data-page]");
            if (pageLink) {
                event.preventDefault();
                const new_page = parseInt(pageLink.getAttribute("data-page"), 10);
                if (Number.isFinite(new_page)) this.paginate(new_page);
                return;
            }

            const th = event.target.closest("th");
            if (th && th.hasAttribute("data-sortable")) {
                if (th.getAttribute("data-sortable") === "false") return;
                event.preventDefault();
                this.sort(th.cellIndex, th.classList.contains("asc") ? "desc" : "asc");
            }
        };

        this.wrapper.addEventListener("click", this._handleWrapperClick);
    }

    on(event, callback) {
        this.events = this.events || {};
        this.events[event] = this.events[event] || [];
        this.events[event].push(callback);
    }

    off(event, callback) {
        this.events = this.events || {};
        if (!(event in this.events)) return;
        const i = this.events[event].indexOf(callback);
        if (i >= 0) this.events[event].splice(i, 1);
    }

    _emit(event, ...args) {
        this.events = this.events || {};
        if (!(event in this.events)) return;
        for (let i = 0; i < this.events[event].length; i++) {
            this.events[event][i].apply(this, args);
        }
    }

    // ====== MESSAGES ======

    setMessage(message) {
        const colspan = this.table.getColumnCount();
        const node = document.createElement("tr");

        const td = document.createElement("td");
        td.className = this.config.classes.message;
        td.colSpan = colspan;
        td.textContent = message;

        node.appendChild(td);
        this.table.body.innerHTML = "";
        this.table.body.appendChild(node);
    }

    // ====== COLUMNS ======

    _buildColumns() {
        let initialSortColumn = null;
        let initialSortDirection = null;

        if (this.config.columns) {
            this.config.columns.forEach((columnsDefinition) => {
                // normaliza select
                if (!isNaN(columnsDefinition.select)) {
                    columnsDefinition.select = [columnsDefinition.select];
                }

                columnsDefinition.select.forEach((column) => {
                    const tableHeaderCell = this.table.header.getCell(column);
                    if (tableHeaderCell === undefined) return;

                    // render
                    if (columnsDefinition.hasOwnProperty("render") && typeof columnsDefinition.render === "function") {
                        this.columnRenderers[column] = columnsDefinition.render;
                    }

                    // sortable
                    if (columnsDefinition.hasOwnProperty("sortable")) {
                        let sortable = false;
                        if (tableHeaderCell.hasSortable) {
                            sortable = tableHeaderCell.isSortable;
                        } else {
                            sortable = columnsDefinition.sortable;
                            tableHeaderCell.setSortable(sortable);
                        }

                        if (sortable) {
                            tableHeaderCell.addClass(this.config.classes.sorter);
                            if (columnsDefinition.hasOwnProperty("sort") && columnsDefinition.select.length === 1) {
                                initialSortColumn = columnsDefinition.select[0];
                                initialSortDirection = columnsDefinition.sort;
                            }
                        }
                    }

                    // searchable (client-side)
                    if (columnsDefinition.hasOwnProperty("searchable")) {
                        tableHeaderCell.addAttribute("data-searchable", columnsDefinition.searchable);
                        if (columnsDefinition.searchable === false) {
                            this.columnsNotSearchable.push(column);
                        }
                    }
                });
            });
        }

        // data-attributes
        this.table.header.getCells().forEach((tableHeaderCell, columnIndex) => {
            if (tableHeaderCell.isSortable === null) {
                tableHeaderCell.setSortable(this.config.sortable);
            }
            if (tableHeaderCell.isSortable) {
                tableHeaderCell.addClass(this.config.classes.sorter);
                if (tableHeaderCell.hasSort) {
                    initialSortColumn = columnIndex;
                    initialSortDirection = tableHeaderCell.sortDirection;
                }
            }
        });

        if (initialSortColumn !== null) {
            this.sort(initialSortColumn, initialSortDirection, true);
        }
    }

    // ====== UTILS ======

    // deep-merge inmutable
    _merge(defaults, patch) {
        const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);

        const mergeRec = (a, b) => {
            if (Array.isArray(a)) return Array.isArray(b) ? [...b] : [...a];
            if (isObj(a)) {
                const out = { ...a };
                if (isObj(b)) {
                    for (const [k, v] of Object.entries(b)) {
                        if (isObj(v)) out[k] = mergeRec(isObj(out[k]) ? out[k] : {}, v);
                        else if (Array.isArray(v)) out[k] = [...v];
                        else out[k] = v;
                    }
                    return out;
                }
                return b !== undefined ? b : out;
            }
            return b !== undefined ? (isObj(b) ? mergeRec({}, b) : b) : a;
        };

        return mergeRec(defaults, patch || {});
    }

    async _parseQueryParams() {
        await this.paginate(1);
    }

    // Limpieza
    destroy() {
        if (this._abortController) this._abortController.abort();
        if (this._handleWrapperClick) {
            this.wrapper.removeEventListener("click", this._handleWrapperClick);
        }
        // Opcional: restaurar tabla al DOM original
        if (this.wrapper && this.table?.element) {
            this.wrapper.parentNode?.replaceChild(this.table.element, this.wrapper);
        }
        this.events = {};
    }
}

class JSTableElement {
    constructor(element) {
        this.element = element;
        this.body = this.element.tBodies[0] || this.element.createTBody();
        this.head = this.element.tHead || this.element.createTHead();

        this.rows = Array.from(this.element.rows).map((row, rowID) => {
            return new JSTableRow(row, row.parentNode.nodeName, rowID);
        });

        this.dataRows = this._getBodyRows();
        this.header = this._getHeaderRow();
    }

    _getBodyRows() {
        return this.rows.filter(row => !row.isHeader && !row.isFooter);
    }

    _getHeaderRow() {
        return this.rows.find(row => row.isHeader) || new JSTableRow(this.head.insertRow(), "THEAD", -1);
    }

    getColumnCount() {
        return this.header.getColumnCount();
    }

    getFooterRow() {
        return this.rows.find(row => row.isFooter);
    }
}

class JSTableRow {
    constructor(element, parentName = "", rowID = null) {
        this.cells = Array.from(element.cells).map(cell => new JSTableCell(cell));
        this.d = this.cells.length;
        this.isHeader = parentName === "THEAD";
        this.isFooter = parentName === "TFOOT";
        this.visible = true;
        this.rowID = rowID;

        this.attributes = {};
        for (const attr of element.attributes) {
            this.attributes[attr.name] = attr.value;
        }
    }

    getCells() { return Array.from(this.cells); }
    getColumnCount() { return this.cells.length; }
    getCell(cell) { return this.cells[cell]; }
    getCellTextContent(cell) { return this.getCell(cell).getTextContent(); }

    static createFromData(data, colKeys) {
        const tr = document.createElement("tr");

        // Permite formato { attributes, data }
        if (data && typeof data === "object" && "data" in data) {
            if (data.attributes && typeof data.attributes === "object") {
                for (const [k, v] of Object.entries(data.attributes)) tr.setAttribute(k, v);
            }
            data = data.data;
        }

        const appendCell = (cellData) => {
            const td = document.createElement("td");
            // {data, attributes}
            const hasObj = cellData && typeof cellData === "object" && "data" in cellData;
            const val = hasObj ? cellData.data : cellData;

            if (val instanceof Node) {
                td.appendChild(val);
            } else if (typeof val === "string") {
                // Seguridad: usa textContent por defecto
                td.textContent = val;
            } else {
                td.textContent = val != null ? String(val) : "";
            }

            if (hasObj && cellData.attributes) {
                for (const [k, v] of Object.entries(cellData.attributes)) td.setAttribute(k, v);
            }
            tr.appendChild(td);
        };

        if (Array.isArray(colKeys) && colKeys.length) {
            for (const key of colKeys) appendCell(data?.[key]);
        } else if (data && typeof data === "object") {
            for (const key of Object.keys(data)) appendCell(data[key]);
        }

        return new JSTableRow(tr);
    }

    getFormatted(columnRenderers, rowAttributesCreator = null, data) {
        const tr = document.createElement("tr");

        // copia atributos base del row
        for (let attr in this.attributes) {
            tr.setAttribute(attr, this.attributes[attr]);
        }

        // atributos dinámicos por fila
        const rowAttributes = rowAttributesCreator ? rowAttributesCreator.call(this, this.getCells()) : {};
        if (rowAttributes && typeof rowAttributes === "object") {
            for (const attrName in rowAttributes) tr.setAttribute(attrName, rowAttributes[attrName]);
        }

        this.getCells().forEach((cell, idx) => {
            const td = document.createElement("td");

            // Render seguro por defecto
            const baseHTML = cell.getInnerHTML();
            const renderer = columnRenderers[idx];

            if (renderer && typeof renderer === "function") {
                // Si el dev retorna HTML, lo asigna bajo su responsabilidad
                const out = renderer.call(this, cell.getElement(), idx, data);
                if (out instanceof Node) td.appendChild(out);
                else td.innerHTML = out != null ? String(out) : "";
            } else {
                // Para seguridad, usa textContent del texto plano
                // Si baseHTML contiene texto, lo pasamos como texto
                // Nota: si necesitas HTML del markup original del <td>, cámbialo a innerHTML
                const tmp = document.createElement("div");
                tmp.innerHTML = baseHTML;
                // usa solo el textContent para evitar HTML potencial
                td.textContent = tmp.textContent || "";
            }

            if (cell.classes.length > 0) td.className = cell.classes.join(" ");
            for (let attr in cell.attributes) td.setAttribute(attr, cell.attributes[attr]);
            tr.appendChild(td);
        });

        return tr;
    }

    setCellClass(cell, className) {
        this.cells[cell].addClass(className);
    }
}

class JSTableCell {
    constructor(element) {
        this.textContent = element.textContent;
        this.innerHTML = element.innerHTML;
        this.className = "";
        this.element = element;

        this.hasSortable = element.hasAttribute("data-sortable");
        this.isSortable = this.hasSortable ? element.getAttribute("data-sortable") === "true" : null;

        this.hasSort = element.hasAttribute("data-sort");
        this.sortDirection = element.getAttribute("data-sort");

        this.classes = [];

        this.attributes = {};
        for (const attr of element.attributes) {
            this.attributes[attr.name] = attr.value;
        }
    }

    getElement() { return this.element; }
    getTextContent() { return this.textContent; }
    getInnerHTML() { return this.innerHTML; }
    setClass(className) { this.className = className; }
    setSortable(value) { this.isSortable = value; }
    addClass(value) { this.classes.push(value); }
    removeClass(value) {
        const i = this.classes.indexOf(value);
        if (i >= 0) this.classes.splice(i, 1);
    }
    addAttribute(key, value) { this.attributes[key] = value; }
}

class JSTablePager {
    constructor(instance) { this.instance = instance; }

    getPages() {
        const pages = Math.ceil(this.instance.getDataCount() / this.instance.config.perPage);
        return pages === 0 ? 1 : pages;
    }

    render() {
        const options = this.instance.config;
        const pages = this.getPages();

        const ul = document.createElement("ul");
        ul.className = options.classes.pagination + "-list";

        if (pages > 1) {
            const prev = this.instance.currentPage === 1 ? 1 : this.instance.currentPage - 1;
            const next = this.instance.currentPage === pages ? pages : this.instance.currentPage + 1;

            if (options.firstLast) ul.appendChild(this.createItem("pager", 1, options.firstText));
            if (options.nextPrev) ul.appendChild(this.createItem("pager", prev, options.prevText));

            const pager = this.truncate();
            pager.forEach(btn => ul.appendChild(btn));

            if (options.nextPrev) ul.appendChild(this.createItem("pager", next, options.nextText));
            if (options.firstLast) ul.appendChild(this.createItem("pager", pages, options.lastText));
        }

        return ul;
    }

    createItem(className, pageNum, content, ellipsis) {
        const item = document.createElement("li");
        item.className = className;

        if (!ellipsis) {
            const a = document.createElement("a");
            a.href = "#";
            a.setAttribute("data-page", String(pageNum));
            a.innerHTML = content;
            if (pageNum === this.instance.currentPage && /^\d+$/.test(String(pageNum))) {
                item.classList.add("active");
                a.setAttribute("aria-current", "page");
            }
            item.appendChild(a);
        } else {
            const span = document.createElement("span");
            span.innerHTML = content;
            item.appendChild(span);
        }
        return item;
    }

    isValidPage(page) {
        return page > 0 && page <= this.getPages();
    }

    truncate() {
        const options = this.instance.config;
        const delta = options.pagerDelta * 2;
        const currentPage = this.instance.currentPage;
        let left = currentPage - options.pagerDelta;
        let right = currentPage + options.pagerDelta;
        const totalPages = this.getPages();
        const range = [];
        const pager = [];
        let lastIndex;

        if (!options.truncatePager) {
            for (let i = 1; i <= totalPages; i++) {
                pager.push(this.createItem(i === currentPage ? "active" : "", i, i));
            }
            return pager;
        }

        if (currentPage < 4 - options.pagerDelta + delta) {
            right = 3 + delta;
        } else if (currentPage > totalPages - (3 - options.pagerDelta + delta)) {
            left = totalPages - (2 + delta);
        }

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= left && i <= right)) range.push(i);
        }

        range.forEach(index => {
            if (lastIndex) {
                if (index - lastIndex === 2) {
                    pager.push(this.createItem("", lastIndex + 1, lastIndex + 1));
                } else if (index - lastIndex !== 1) {
                    pager.push(this.createItem(options.classes.ellipsis, 0, options.ellipsisText, true));
                }
            }
            pager.push(this.createItem(index === currentPage ? "active" : "", index, index));
            lastIndex = index;
        });

        return pager;
    }
}

window.JSTable = JSTable;
