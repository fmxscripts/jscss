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

    // Customise the display text
    labels: {
        placeholder: "Search...",
        perPage: "{select} entries per page",
        noRows: "...",
        info: "Showing {start} to {end} of {rows} entries",
        loading: "Loading...",
        infoFiltered: "Showing {start} to {end} of {rows} entries (filtered from {rowsTotal} entries)"
    },

    layout: {
        top: "",
        bottom: "{pager}"
    },

    serverSide: true,
    ajax: null,
    ajaxParams: {},
    queryParams: {
        page: 'page',
        search: 'search'
    },

    addQueryParams: true,
    searchDelay: null,
    rowAttributesCreator: null,
    method: 'POST',
    colKeys: null,
    columnsKeys: null,
};

class JSTable {
    constructor(element, config = {}) {
        let DOMElement = element;
        if (typeof element === "string") {
            DOMElement = document.querySelector(element);
        }
        if (DOMElement === null) {
            throw new Error("Element not found");
        }

        this.config = this._merge(JSTableDefaultConfig, config);
        this.table = new JSTableElement(DOMElement);

        // reset values
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
        this.events = {};
        this.isLoading = false;
        this.abortController = null;

        // init pager
        this.pager = new JSTablePager(this);

        // build wrapper and layout
        this._build();
        this._buildColumns();

        // update table content
        this.update(!this.config.serverSide);

        // bind events
        this._bindEvents();

        if (config.events) {
            for (let eKey in config.events) {
                this.on(eKey, config.events[eKey]);
            }
        }

        this._emit("init");
        this._parseQueryParams();
    }

    _build() {
        let options = this.config;

        this.wrapper = document.createElement("div");
        this.wrapper.className = options.classes.wrapper;

        const paginationStyle = !options.pagination ? "style='display: none'" : "";
        const inner = `
            <div class='${options.classes.container}'>
                <div class='${options.classes.loading} hidden'>${options.labels.loading}</div>
            </div>
            <div class='${options.classes.bottom}' ${paginationStyle}>
                ${options.layout.bottom.replace("{pager}", `<div class="${options.classes.pagination}" ${paginationStyle}></div>`)}
            </div>
        `;

        // Add table class
        this.table.element.classList.add(options.classes.table);

        this.wrapper.innerHTML = inner;
        this.table.element.parentNode.replaceChild(this.wrapper, this.table.element);

        let container = this.wrapper.querySelector(`.${options.classes.container}`);
        container.appendChild(this.table.element);

        this._updatePagination();
        this._updateInfo();
    }

    setAjaxParams(params) {
        this.config.ajaxParams = Object.assign({}, this.config.ajaxParams, params);
    }

    resetPagination() {
        this.currentPage = 1;
        return this.update(true);
    }

    async update(reloadData = true) {
        // Prevent overlapping requests
        if (this.isLoading) {
            if (this.abortController) {
                this.abortController.abort();
            }
        }

        // Validate current page
        const totalPages = this.pager.getPages();
        if (this.currentPage > totalPages && totalPages > 0) {
            this.currentPage = totalPages;
        }

        // Show loading indicator
        this._setLoading(true);

        try {
            // Create Header
            this._updateHeader();

            if (reloadData) {
                const data = await this.getPageData(this.currentPage);
                this._renderTableBody(data);
                this._emit("update");
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Update error:", error);
                this._emit("error", error);
            }
        } finally {
            this._setLoading(false);
            this._updatePagination();
            this._updateInfo();
        }
    }

    _updateHeader() {
        this.table.header.getCells().forEach((tableHeaderCell, columnIndex) => {
            const th = this.table.head.rows[0].cells[columnIndex];
            th.innerHTML = tableHeaderCell.getInnerHTML();

            if (tableHeaderCell.classes.length > 0) {
                th.className = tableHeaderCell.classes.join(" ");
            }

            for (let attr in tableHeaderCell.attributes) {
                th.setAttribute(attr, tableHeaderCell.attributes[attr]);
            }

            th.setAttribute("data-sortable", tableHeaderCell.isSortable);
        });
    }

    _renderTableBody(data) {
        this.table.element.classList.remove("hidden");
        this.table.body.innerHTML = "";

        if (data.length === 0) {
            this.wrapper.classList.remove("search-results");
            this.setMessage(this.config.labels.noRows);
            return;
        }

        const fragment = document.createDocumentFragment();
        data.forEach((row, idx) => {
            fragment.appendChild(
                row.getFormatted(
                    this.columnRenderers,
                    this.config.rowAttributesCreator,
                    this.response ? this.response.data[idx] : null
                )
            );
        });

        this.table.body.appendChild(fragment);
    }

    _setLoading(isLoading) {
        this.isLoading = isLoading;
        const loadingEl = this.wrapper.querySelector(`.${this.config.classes.loading}`);

        if (loadingEl) {
            loadingEl.classList.toggle("hidden", !isLoading);
        }

        this.table.element.classList.toggle("hidden", isLoading);
    }

    _updatePagination() {
        const pagination = this.wrapper.querySelector(`.${this.config.classes.pagination}`);
        if (pagination) {
            pagination.innerHTML = "";
            pagination.appendChild(this.pager.render(this.currentPage));
        }
    }

    _updateInfo() {
        const info = this.wrapper.querySelector(`.${this.config.classes.info}`);
        if (!info) return;

        const infoString = this.isSearching ?
            this.config.labels.infoFiltered :
            this.config.labels.info;

        if (infoString.length) {
            const dataCount = this.getDataCount();
            const string = infoString
                .replace("{start}", dataCount > 0 ? this._getPageStartIndex() + 1 : 0)
                .replace("{end}", this._getPageEndIndex() + 1)
                .replace("{page}", this.currentPage)
                .replace("{pages}", this.pager.getPages())
                .replace("{rows}", dataCount)
                .replace("{rowsTotal}", this.getDataCountTotal());

            info.innerHTML = string;
        }
    }

    _getPageStartIndex() {
        return (this.currentPage - 1) * this.config.perPage;
    }

    _getPageEndIndex() {
        const end = this.currentPage * this.config.perPage - 1;
        return Math.min(end, this.getDataCount() - 1);
    }

    _getData() {
        this._emit("getData", this.table.dataRows);
        return this.table.dataRows.filter(row => row.visible);
    }

    async _fetchData() {
        // Abort previous request if exists
        if (this.abortController) {
            this.abortController.abort();
        }

        this.abortController = new AbortController();
        const that = this;

        const params = {
            "sortColumn": this.sortColumn,
            "sortDirection": this.sortDirection,
            "start": this._getPageStartIndex(),
            "length": this.config.perPage,
            "datatable": 1,
            ...this.config.ajaxParams
        };

        that._emit("before", that);

        const data = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            data.append(key, value);
        }

        try {
            const response = await fetch(this.config.ajax, {
                method: this.config.method,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                body: data,
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const json = await response.json();
            that._emit("after", json);
            that._emit("fetchData", json);

            that.response = json;
            that.filteredDataCount = json.recordsFiltered;
            that.totalDataCount = json.recordsTotal;

            // Create Table Rows from data
            const rows = json.data.map(dataRow =>
                JSTableRow.createFromData(dataRow, that.config.columnsKeys)
            );

            return rows;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Fetch error:", error);
                that._emit("error", error);
                throw error;
            }
        }
    }

    getResponse() {
        return this.response;
    }

    getDataCount() {
        return this.isSearching ?
            this.getDataCountFiltered() :
            this.getDataCountTotal();
    }

    getDataCountFiltered() {
        return this.config.serverSide ?
            this.filteredDataCount :
            this._getData().length;
    }

    getDataCountTotal() {
        return this.config.serverSide ?
            this.totalDataCount :
            this.table.dataRows.length;
    }

    getPageData() {
        if (this.config.serverSide) {
            return this._fetchData();
        }

        const start_idx = this._getPageStartIndex();
        const end_idx = this._getPageEndIndex();

        return Promise.resolve(
            this._getData().filter((row, idx) =>
                idx >= start_idx && idx <= end_idx
            )
        );
    }

    sort(column, direction, initial = false) {
        if (column < 0 || column > this.table.getColumnCount() - 1) {
            return false;
        }

        this.sortColumn = column;
        this.sortDirection = direction;

        const tableHeaderCells = this.table.header.getCells();
        tableHeaderCells.forEach(tableHeaderCell => {
            tableHeaderCell.removeClass("asc");
            tableHeaderCell.removeClass("desc");
        });

        const node = this.table.header.getCell(this.sortColumn);
        node.addClass(this.sortDirection);

        if (!this.config.serverSide) {
            this.table.dataRows = this._sortLocalData();
        }

        if (!this.config.serverSide || !initial) {
            this.update();
        }

        this._emit("sort", this.sortColumn, this.sortDirection);
    }

    _sortLocalData() {
        const that = this;
        return this.table.dataRows.sort((a, b) => {
            let ca = a.getCellTextContent(that.sortColumn).toLowerCase();
            let cb = b.getCellTextContent(that.sortColumn).toLowerCase();

            // Clean and parse values for numeric comparison
            ca = this._parseCellValue(ca);
            cb = this._parseCellValue(cb);

            // Handle empty cells or mixed content types
            if ((ca === '' && cb !== '') || (isNaN(ca) && !isNaN(cb))) {
                return that.sortDirection === "asc" ? 1 : -1;
            }
            if ((ca !== '' && cb === '') || (!isNaN(ca) && isNaN(cb))) {
                return that.sortDirection === "asc" ? -1 : 1;
            }

            // Compare values
            if (that.sortDirection === "asc") {
                return ca === cb ? 0 : ca > cb ? 1 : -1;
            }
            return ca === cb ? 0 : ca < cb ? 1 : -1;
        });
    }

    _parseCellValue(value) {
        // Remove common formatting characters and try to parse as number
        const cleaned = value.replace(/(\$|\,|\s|%)/g, "");
        return !isNaN(cleaned) && cleaned !== '' ? parseFloat(cleaned) : cleaned;
    }

    async paginate(new_page) {
        const oldPage = this.currentPage;
        this.currentPage = new_page;

        await this.update();
        this._emit("paginate", this.currentPage, oldPage);
    }

    _bindEvents() {
        this.wrapper.addEventListener("click", (event) => {
            const node = event.target;

            // Handle pagination clicks
            if (node.hasAttribute("data-page")) {
                event.preventDefault();
                const new_page = parseInt(node.getAttribute("data-page"), 10);
                this.paginate(new_page);
                return;
            }

            // Handle sort clicks
            if (node.nodeName === "TH" && node.hasAttribute("data-sortable")) {
                if (node.getAttribute("data-sortable") === "false") {
                    return false;
                }

                event.preventDefault();
                this.sort(node.cellIndex, node.classList.contains("asc") ? "desc" : "asc");
            }
        });
    }

    on(event, callback) {
        this.events[event] = this.events[event] || [];
        this.events[event].push(callback);
    }

    off(event, callback) {
        if (!(event in this.events)) return;

        const index = this.events[event].indexOf(callback);
        if (index > -1) {
            this.events[event].splice(index, 1);
        }
    }

    _emit(event, ...args) {
        if (!this.events[event]) return;

        this.events[event].forEach(callback => {
            try {
                callback.apply(this, args);
            } catch (error) {
                console.error(`Error in event handler for ${event}:`, error);
            }
        });
    }

    setMessage(message) {
        const colspan = this.table.getColumnCount();
        const node = document.createElement("tr");

        node.innerHTML = `
            <td class="${this.config.classes.message}" colspan="${colspan}">
                ${message}
            </td>
        `;

        this.table.body.innerHTML = "";
        this.table.body.appendChild(node);
    }

    _buildColumns() {
        let initialSortColumn = null;
        let initialSortDirection = null;

        if (this.config.columns) {
            this.config.columns.forEach(columnsDefinition => {
                if (!Array.isArray(columnsDefinition.select)) {
                    columnsDefinition.select = [columnsDefinition.select];
                }

                columnsDefinition.select.forEach(column => {
                    const tableHeaderCell = this.table.header.getCell(column);
                    if (!tableHeaderCell) return;

                    // Handle rendering
                    if (columnsDefinition.render && typeof columnsDefinition.render === "function") {
                        this.columnRenderers[column] = columnsDefinition.render;
                    }

                    // Handle sortable
                    if (columnsDefinition.hasOwnProperty("sortable")) {
                        const sortable = tableHeaderCell.hasSortable ?
                            tableHeaderCell.isSortable :
                            columnsDefinition.sortable;

                        tableHeaderCell.setSortable(sortable);

                        if (sortable) {
                            tableHeaderCell.addClass(this.config.classes.sorter);

                            if (columnsDefinition.sort && columnsDefinition.select.length === 1) {
                                initialSortColumn = columnsDefinition.select[0];
                                initialSortDirection = columnsDefinition.sort;
                            }
                        }
                    }

                    // Handle searchable
                    if (columnsDefinition.hasOwnProperty("searchable")) {
                        tableHeaderCell.addAttribute("data-searchable", columnsDefinition.searchable);

                        if (columnsDefinition.searchable === false) {
                            this.columnsNotSearchable.push(column);
                        }
                    }
                });
            });
        }

        // Process data-attributes
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

        // Apply initial sort
        if (initialSortColumn !== null) {
            this.sort(initialSortColumn, initialSortDirection, true);
        }
    }

    _merge(current, update) {
        for (let key in current) {
            if (update.hasOwnProperty(key) &&
                typeof update[key] === "object" &&
                !Array.isArray(update[key]) &&
                update[key] !== null) {
                this._merge(current[key], update[key]);
            } else if (!update.hasOwnProperty(key)) {
                update[key] = current[key];
            }
        }
        return update;
    }

    async _parseQueryParams() {
        await this.paginate(1);
    }

    destroy() {
        // Cleanup event listeners
        this.wrapper.replaceWith(this.table.element);
        this.table.element.classList.remove(this.config.classes.table);

        // Abort any pending requests
        if (this.abortController) {
            this.abortController.abort();
        }
    }
}

class JSTableElement {
    constructor(element) {
        this.element = element;
        this.body = this.element.tBodies[0];
        this.head = this.element.tHead;

        this.rows = Array.from(this.element.rows).map((row, rowID) =>
            new JSTableRow(row, row.parentNode.nodeName, rowID)
        );

        this.dataRows = this._getBodyRows();
        this.header = this._getHeaderRow();
    }

    _getBodyRows() {
        return this.rows.filter(row => !row.isHeader && !row.isFooter);
    }

    _getHeaderRow() {
        return this.rows.find(row => row.isHeader);
    }

    getColumnCount() {
        return this.header ? this.header.getColumnCount() : 0;
    }

    getFooterRow() {
        return this.rows.find(row => row.isFooter);
    }
}

class JSTableRow {
    constructor(element, parentName = "", rowID = null) {
        this.cells = Array.from(element.cells).map(cell =>
            new JSTableCell(cell)
        );

        this.isHeader = parentName === "THEAD";
        this.isFooter = parentName === "TFOOT";
        this.visible = true;
        this.rowID = rowID;

        // Parse attributes
        this.attributes = {};
        Array.from(element.attributes).forEach(attr => {
            this.attributes[attr.name] = attr.value;
        });
    }

    getCells() {
        return this.cells.slice();
    }

    getColumnCount() {
        return this.cells.length;
    }

    getCell(cell) {
        return this.cells[cell];
    }

    getCellTextContent(cell) {
        return this.getCell(cell).getTextContent();
    }

    static createFromData(data, columnsKeys) {
        const tr = document.createElement("tr");

        // Handle data with attributes
        if (data && typeof data === 'object') {
            if (data.attributes) {
                for (const attrName in data.attributes) {
                    tr.setAttribute(attrName, data.attributes[attrName]);
                }
            }

            // Extract actual data
            const rowData = data.data || data;

            if (columnsKeys) {
                columnsKeys.forEach(key => {
                    const cellData = rowData[key];
                    const td = document.createElement("td");

                    if (cellData && typeof cellData === 'object' && cellData.data !== undefined) {
                        td.innerHTML = cellData.data;
                        if (cellData.attributes) {
                            for (const attrName in cellData.attributes) {
                                td.setAttribute(attrName, cellData.attributes[attrName]);
                            }
                        }
                    } else {
                        td.innerHTML = cellData !== undefined ? cellData : '';
                    }

                    tr.appendChild(td);
                });
            } else {
                for (const key in rowData) {
                    const cellData = rowData[key];
                    const td = document.createElement("td");

                    if (cellData && typeof cellData === 'object' && cellData.data !== undefined) {
                        td.innerHTML = cellData.data;
                        if (cellData.attributes) {
                            for (const attrName in cellData.attributes) {
                                td.setAttribute(attrName, cellData.attributes[attrName]);
                            }
                        }
                    } else {
                        td.innerHTML = cellData !== undefined ? cellData : '';
                    }

                    tr.appendChild(td);
                }
            }
        }

        return new JSTableRow(tr);
    }

    getFormatted(columnRenderers, rowAttributesCreator = null, data) {
        const tr = document.createElement("tr");

        // Copy original attributes
        for (let attr in this.attributes) {
            tr.setAttribute(attr, this.attributes[attr]);
        }

        // Add custom attributes
        if (rowAttributesCreator) {
            const customAttributes = rowAttributesCreator(this.getCells());
            for (const attrName in customAttributes) {
                tr.setAttribute(attrName, customAttributes[attrName]);
            }
        }

        // Create cells
        this.getCells().forEach((cell, idx) => {
            const td = document.createElement('td');

            // Apply renderer if exists
            if (columnRenderers && columnRenderers[idx]) {
                td.innerHTML = columnRenderers[idx].call(this, cell.getElement(), idx, data);
            } else {
                td.innerHTML = cell.getInnerHTML();
            }

            // Copy classes
            if (cell.classes.length > 0) {
                td.className = cell.classes.join(" ");
            }

            // Copy attributes
            for (let attr in cell.attributes) {
                td.setAttribute(attr, cell.attributes[attr]);
            }

            tr.appendChild(td);
        });

        return tr;
    }

    setCellClass(cell, className) {
        if (this.cells[cell]) {
            this.cells[cell].addClass(className);
        }
    }
}

class JSTableCell {
    constructor(element) {
        this.textContent = element.textContent;
        this.innerHTML = element.innerHTML;
        this.element = element;

        this.hasSortable = element.hasAttribute("data-sortable");
        this.isSortable = this.hasSortable ?
            element.getAttribute("data-sortable") === "true" :
            null;

        this.hasSort = element.hasAttribute("data-sort");
        this.sortDirection = element.getAttribute("data-sort");

        this.classes = [];
        this.attributes = {};

        // Parse attributes
        Array.from(element.attributes).forEach(attr => {
            this.attributes[attr.name] = attr.value;
        });
    }

    getElement() {
        return this.element;
    }

    getTextContent() {
        return this.textContent;
    }

    getInnerHTML() {
        return this.innerHTML;
    }

    setSortable(value) {
        this.isSortable = value;
    }

    addClass(value) {
        if (!this.classes.includes(value)) {
            this.classes.push(value);
        }
    }

    removeClass(value) {
        const index = this.classes.indexOf(value);
        if (index > -1) {
            this.classes.splice(index, 1);
        }
    }

    addAttribute(key, value) {
        this.attributes[key] = value;
    }
}

class JSTablePager {
    constructor(instance) {
        this.instance = instance;
    }

    getPages() {
        const dataCount = this.instance.getDataCount();
        const perPage = this.instance.config.perPage;
        const pages = Math.ceil(dataCount / perPage);
        return pages === 0 ? 1 : pages;
    }

    render() {
        const options = this.instance.config;
        const pages = this.getPages();
        const ul = document.createElement("ul");

        if (pages <= 1) return ul;

        const prev = this.instance.currentPage === 1 ? 1 : this.instance.currentPage - 1;
        const next = this.instance.currentPage === pages ? pages : this.instance.currentPage + 1;

        // first button
        if (options.firstLast) {
            ul.appendChild(this.createItem("pager", 1, options.firstText));
        }

        // prev button
        if (options.nextPrev) {
            ul.appendChild(this.createItem("pager", prev, options.prevText));
        }

        // page numbers
        this.truncate().forEach(btn => {
            ul.appendChild(btn);
        });

        // next button
        if (options.nextPrev) {
            ul.appendChild(this.createItem("pager", next, options.nextText));
        }

        // last button
        if (options.firstLast) {
            ul.appendChild(this.createItem("pager", pages, options.lastText));
        }

        return ul;
    }

    createItem(className, pageNum, content, isEllipsis = false) {
        const item = document.createElement("li");
        item.className = className;

        if (isEllipsis) {
            item.innerHTML = `<span>${content}</span>`;
        } else {
            item.innerHTML = `<a href="#" data-page="${pageNum}">${content}</a>`;
        }

        return item;
    }

    truncate() {
        const options = this.instance.config;
        const currentPage = this.instance.currentPage;
        const totalPages = this.getPages();
        const pager = [];

        if (!options.truncatePager) {
            for (let i = 1; i <= totalPages; i++) {
                pager.push(this.createItem(
                    i === currentPage ? "active" : "",
                    i,
                    i
                ));
            }
            return pager;
        }

        const delta = options.pagerDelta;
        let left = currentPage - delta;
        let right = currentPage + delta + 1;
        const range = [];
        let l;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= left && i < right)) {
                range.push(i);
            }
        }

        for (let i of range) {
            if (l) {
                if (i - l === 2) {
                    pager.push(this.createItem("", l + 1, l + 1));
                } else if (i - l !== 1) {
                    pager.push(this.createItem(
                        options.classes.ellipsis,
                        0,
                        options.ellipsisText,
                        true
                    ));
                }
            }
            pager.push(this.createItem(
                i === currentPage ? "active" : "",
                i,
                i
            ));
            l = i;
        }

        return pager;
    }
}

window.JSTable = JSTable;