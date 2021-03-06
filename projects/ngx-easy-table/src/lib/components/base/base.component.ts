import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChange,
  SimpleChanges,
  TemplateRef,
  ViewChild,
} from '@angular/core';

import {
  Columns,
  Config,
  Event,
  API,
  Pagination,
  ColumnKeyType,
  TableMouseEvent,
  ApiType,
} from '../..';
import { ConfigService } from '../../services/config-service';
import { UtilsService } from '../../services/utils-service';
import { PaginationComponent, PaginationRange } from '../pagination/pagination.component';
import { GroupRowsService } from '../../services/group-rows.service';
import { StyleService } from '../../services/style.service';

interface RowContextMenuPosition {
  top: string | null;
  left: string | null;
  value: any | null;
}

@Component({
  selector: 'ngx-table',
  providers: [ConfigService, UtilsService, GroupRowsService, StyleService],
  templateUrl: './base.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BaseComponent implements OnInit, OnChanges {
  @ViewChild('paginationComponent') private paginationComponent: PaginationComponent;
  @ViewChild('th') private th;
  public selectedRow: number;
  public selectedCol: number;
  public term;
  public tableClass = null;
  public globalSearchTerm: string;
  public grouped: any = [];
  public menuActive = false;
  public isSelected = false;
  public page = 1;
  public count = null;
  public rowContextMenuPosition: RowContextMenuPosition = {
    top: null,
    left: null,
    value: null,
  };
  public limit;
  public sortBy: { key: string } & { order: string } = {
    key: '',
    order: 'asc',
  };
  public sortByIcon: { key: string } & { order: string } = {
    key: '',
    order: 'asc',
  };
  public selectedDetailsTemplateRowId = new Set();
  public id;
  public startOffset;
  public loadingHeight = '30px';
  public config: Config;
  onSelectAllBinded = this.onSelectAll.bind(this);

  @Input('configuration')
  set configuration(value: Config) {
    this.config = value;
  }

  get configuration(): Config {
    return this.config;
  }

  @Input() data: any[];
  @Input() pagination: Pagination;
  @Input() groupRowsBy: string;
  @Input() toggleRowIndex;
  @Input() detailsTemplate: TemplateRef<any>;
  @Input() summaryTemplate: TemplateRef<any>;
  @Input() groupRowsHeaderTemplate: TemplateRef<any>;
  @Input() filtersTemplate: TemplateRef<any>;
  @Input() selectAllTemplate: TemplateRef<any>;
  @Input() noResultsTemplate: TemplateRef<any>;
  @Input() rowContextMenu: TemplateRef<any>;
  @Input() columns: Columns[];
  @Output() readonly event = new EventEmitter<{ event: string, value: any }>();
  @ContentChild(TemplateRef) public rowTemplate: TemplateRef<any>;

  constructor(private readonly cdr: ChangeDetectorRef) {
    this.id = UtilsService.randomId();
  }

  ngOnInit() {
    if (!this.columns) {
      console.error('[columns] property required!');
    }
    if (this.configuration) {
      ConfigService.config = this.configuration;
    }
    this.config = ConfigService.config;
    this.limit = this.config.rows;
    if (this.groupRowsBy) {
      this.grouped = GroupRowsService.doGroupRows(this.data, this.groupRowsBy);
    }
    this.doDecodePersistedState();
  }

  ngOnChanges(changes: SimpleChanges) {
    const data: SimpleChange = changes.data;
    const pagination: SimpleChange = changes.pagination;
    const groupRowsBy: SimpleChange = changes.groupRowsBy;
    this.toggleRowIndex = changes.toggleRowIndex;
    if (data && data.currentValue) {
      this.doApplyData(data);
    }
    if (pagination && pagination.currentValue) {
      this.count = pagination.currentValue.count;
    }
    if (groupRowsBy && groupRowsBy.currentValue) {
      this.grouped = GroupRowsService.doGroupRows(this.data, this.groupRowsBy);
    }
    if (this.toggleRowIndex && this.toggleRowIndex.currentValue) {
      const row = this.toggleRowIndex.currentValue;
      this.collapseRow(row.index);
    }
  }

  isOrderEnabled(column: Columns) {
    const columnOrderEnabled = column.orderEnabled === undefined ? true : !!column.orderEnabled;
    return ConfigService.config.orderEnabled && columnOrderEnabled;
  }

  orderBy(column: Columns): void {
    if (typeof column.orderEnabled !== 'undefined' && !column.orderEnabled) {
      return;
    }
    const key = column.key;
    if (!ConfigService.config.orderEnabled || key === '') {
      return;
    }

    this.sortByIcon.key = key;
    if (this.sortByIcon.order === 'asc') {
      this.sortByIcon.order = 'desc';
    } else {
      this.sortByIcon.order = 'asc';
    }

    if (!ConfigService.config.orderEventOnly && !column.orderEventOnly) {
      this.sortBy.key = this.sortByIcon.key;
      this.sortBy.order = this.sortByIcon.order;
    } else {
      this.sortBy.key = '';
      this.sortBy.order = '';
    }
    if (!ConfigService.config.serverPagination) {
      this.data = [...this.data];
    }
    this.sortBy = { ...this.sortBy };
    const value = {
      key,
      order: this.sortByIcon.order,
    };
    this.emitEvent(Event.onOrder, value);
  }

  onClick($event: MouseEvent, row: object, key: ColumnKeyType, colIndex: number | null, rowIndex: number): void {
    if (ConfigService.config.selectRow) {
      this.selectedRow = rowIndex;
    }
    if (ConfigService.config.selectCol && colIndex) {
      this.selectedCol = colIndex;
    }
    if (ConfigService.config.selectCell && colIndex) {
      this.selectedRow = rowIndex;
      this.selectedCol = colIndex;
    }
    if (ConfigService.config.clickEvent) {
      const value: TableMouseEvent = {
        event: $event,
        row,
        key,
        rowId: rowIndex,
        colId: colIndex,
      };
      this.emitEvent(Event.onClick, value);
    }
  }

  onDoubleClick($event: MouseEvent, row: object, key: ColumnKeyType, colIndex: number | null, rowIndex: number): void {
    const value: TableMouseEvent = {
      event: $event,
      row,
      key,
      rowId: rowIndex,
      colId: colIndex,
    };
    this.emitEvent(Event.onDoubleClick, value);
  }

  onCheckboxSelect($event: object, row: object, rowIndex: number): void {
    const value = {
      event: $event,
      row,
      rowId: rowIndex,
    };
    this.emitEvent(Event.onCheckboxSelect, value);
  }

  onSelectAll() {
    this.isSelected = !this.isSelected;
    this.emitEvent(Event.onSelectAll, this.isSelected);
  }

  onSearch($event: Array<{ key: string; value: string }>): void {
    if (!ConfigService.config.serverPagination) {
      this.term = $event;
    }
    this.emitEvent(Event.onSearch, $event);
  }

  onGlobalSearch(value: string): void {
    if (!ConfigService.config.serverPagination) {
      this.globalSearchTerm = value;
    }
    this.emitEvent(Event.onGlobalSearch, value);
  }

  onPagination(pagination: PaginationRange): void {
    this.page = pagination.page;
    this.limit = pagination.limit;
    this.emitEvent(Event.onPagination, pagination);
  }

  private emitEvent(event: string, value: any): void {
    this.event.emit({ event, value });
    if (this.config.persistState) {
      localStorage.setItem(event, JSON.stringify(value));
    }
    if (this.config.logger) {
      // tslint:disable-next-line:no-console
      console.log({ event, value });
    }
  }

  collapseRow(rowIndex: number): void {
    if (this.selectedDetailsTemplateRowId.has(rowIndex)) {
      this.selectedDetailsTemplateRowId.delete(rowIndex);
      this.emitEvent(Event.onRowCollapsedHide, rowIndex);
    } else {
      this.selectedDetailsTemplateRowId.add(rowIndex);
      this.emitEvent(Event.onRowCollapsedShow, rowIndex);
    }
  }

  private doDecodePersistedState() {
    if (!this.config.persistState) {
      return;
    }
    const pagination = localStorage.getItem(Event.onPagination);
    const sort = localStorage.getItem(Event.onOrder);
    const search = localStorage.getItem(Event.onSearch);
    if (pagination) {
      this.onPagination(JSON.parse(pagination));
    }
    if (sort) {
      const { key, order } = JSON.parse(sort);
      this.sortBy.key = key;
      this.sortBy.order = order;
      this.data = [...this.data];
    }
    if (search) {
      this.term = JSON.parse(search);
    }
  }

  isRowCollapsed(rowIndex: number): boolean {
    if (this.config.collapseAllRows) {
      return true;
    }
    return this.selectedDetailsTemplateRowId.has(rowIndex);
  }

  onMouseDown(event, th) {
    if (!this.config.resizeColumn) {
      return;
    }
    this.th = th;
    this.startOffset = th.offsetWidth - event.pageX;
    this.emitEvent(Event.onColumnResizeMouseDown, event);
  }

  onMouseMove(event) {
    if (!this.config.resizeColumn) {
      return;
    }
    if (this.th && this.th.style) {
      this.th.style.width = this.startOffset + event.pageX + 'px';
      this.th.style.cursor = 'col-resize';
      this.th.style['user-select'] = 'none';
    }
  }

  onMouseUp(event) {
    if (!this.config.resizeColumn) {
      return;
    }
    this.emitEvent(Event.onColumnResizeMouseUp, event);
    this.th.style.cursor = 'default';
    this.th = undefined;
  }

  get isLoading(): boolean {
    const table = document.getElementById('table') as HTMLTableElement;
    if (table && table.rows && table.rows.length > 3) {
      this.getLoadingHeight(table.rows);
    }
    return this.config.isLoading;
  }

  getLoadingHeight(rows: any): void {
    const searchEnabled = this.config.searchEnabled ? 1 : 0;
    const headerEnabled = this.config.headerEnabled ? 1 : 0;
    const borderTrHeight = 1;
    const borderDivHeight = 2;
    this.loadingHeight = (rows.length - searchEnabled - headerEnabled) * (rows[3].offsetHeight - borderTrHeight) - borderDivHeight + 'px';
  }

  getColumnWidth(column: any): string | null {
    if (column.width) {
      return column.width;
    }
    return this.config.fixedColumnWidth ? 100 / this.columns.length + '%' : null;
  }

  getColumnDefinition(column: Columns): boolean {
    return column.searchEnabled || typeof column.searchEnabled === 'undefined';
  }

  get arrowDefinition(): boolean {
    return this.config.showDetailsArrow || typeof this.config.showDetailsArrow === 'undefined';
  }

  onRowContextMenu($event: MouseEvent, row: object, key: ColumnKeyType, colIndex: number | null, rowIndex: number): void {
    if (!this.config.showContextMenu) {
      return;
    }
    $event.preventDefault();
    const value: TableMouseEvent = {
      event: $event,
      row,
      key,
      rowId: rowIndex,
      colId: colIndex,
    };
    this.rowContextMenuPosition = {
      top: `${$event.y - 10}px`,
      left: `${$event.x - 10}px`,
      value,
    };

    this.emitEvent(Event.onRowContextMenu, value);
  }

  private doApplyData(data) {
    const column = this.columns.find((c) => !!c.orderBy);
    if (column) {
      this.sortByIcon.order = (column.orderBy === 'asc') ? 'desc' : 'asc';
      this.orderBy(column);
    } else {
      this.data = [...data.currentValue];
    }
  }

  onDrop(event: CdkDragDrop<string[]>) {
    this.emitEvent(Event.onRowDrop, event);
    moveItemInArray(this.data, event.previousIndex, event.currentIndex);
  }

  apiEvent(event: ApiType): void | number {
    return this.bindApi(event);
  }

  // tslint:disable:no-big-function cognitive-complexity
  private bindApi(event: ApiType): void | number {
    switch (event.type) {
      case API.rowContextMenuClicked:
        this.rowContextMenuPosition = {
          top: null,
          left: null,
          value: null,
        };
        break;
      case API.toolPanelClicked:
        // TODO
        break;
      case API.setInputValue:
        if (!this.config.searchEnabled) {
          console.error('Can\'t set API.setInputValue because config.searchEnabled is set to false ');
          return;
        }
        event.value.forEach((i) => (document.getElementById(`search_${i.key}`) as HTMLInputElement).value = i.value);
        this.onSearch(event.value);
        this.cdr.detectChanges();
        break;
      case API.onGlobalSearch:
        this.onGlobalSearch(event.value);
        this.cdr.detectChanges();
        break;
      case API.setRowClass:
        if (Array.isArray(event.value)) {
          event.value.forEach((val) => StyleService.setRowClass(val));
          break;
        }
        StyleService.setRowClass(event.value);
        this.cdr.detectChanges();
        break;
      case API.setCellClass:
        if (Array.isArray(event.value)) {
          event.value.forEach((val) => StyleService.setCellClass(val));
          break;
        }
        StyleService.setCellClass(event.value);
        break;
      case API.setRowStyle:
        if (Array.isArray(event.value)) {
          event.value.forEach((val) => StyleService.setRowStyle(val));
          break;
        }
        StyleService.setRowStyle(event.value);
        break;
      case API.setCellStyle:
        if (Array.isArray(event.value)) {
          event.value.forEach((val) => StyleService.setCellStyle(val));
          break;
        }
        StyleService.setCellStyle(event.value);
        break;
      case API.setTableClass:
        this.tableClass = event.value;
        this.cdr.detectChanges();
        break;
      case API.getPaginationTotalItems:
        return this.paginationComponent.paginationDirective.getTotalItems();
      case API.setPaginationCurrentPage:
        this.paginationComponent.paginationDirective.setCurrent(event.value);
        break;
      case API.setPaginationRange:
        this.paginationComponent.ranges = event.value;
        break;
      case API.setPaginationPreviousLabel:
        this.paginationComponent.previousLabel = event.value;
        break;
      case API.setPaginationNextLabel:
        this.paginationComponent.nextLabel = event.value;
        break;
      case API.sortBy:
        const column: Columns = { title: '', key: event.value.column, orderBy: event.value.order };
        this.orderBy(column);
        this.cdr.detectChanges();
        break;
      default:
        break;
    }
  }
}
