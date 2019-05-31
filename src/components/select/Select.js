import Choices from 'choices.js';
import _ from 'lodash';
import Formio from '../../Formio';
import Field from '../_classes/field/Field';
import Form from '../../Form';

export default class SelectComponent extends Field {
  static schema(...extend) {
    return Field.schema({
      type: 'select',
      label: 'Select',
      key: 'select',
      data: {
        values: [],
        json: '',
        url: '',
        resource: '',
        custom: ''
      },
      clearOnRefresh: false,
      limit: 100,
      dataSrc: 'values',
      valueProperty: '',
      lazyLoad: true,
      filter: '',
      searchEnabled: true,
      searchField: '',
      minSearch: 0,
      readOnlyValue: false,
      authenticate: false,
      template: '<span>{{ item.label }}</span>',
      selectFields: '',
      searchThreshold: 0.3,
      tableView: true,
      fuseOptions: {
        include: 'score',
        threshold: 0.3,
      },
      customOptions: {}
    }, ...extend);
  }

  static get builderInfo() {
    return {
      title: 'Select',
      group: 'basic',
      icon: 'th-list',
      weight: 70,
      documentation: 'http://help.form.io/userguide/#select',
      schema: SelectComponent.schema()
    };
  }

  init() {
    super.init();

    // Trigger an update.
    this.triggerUpdate = _.debounce(this.updateItems.bind(this), 100);

    // Keep track of the select options.
    this.selectOptions = [];

    if (this.isSelectResource) {
      this.serverCount = null;
      this.isScrollLoading = false;
      this.downloadedResources = [];
    }

    // If this component has been activated.
    this.activated = false;

    // Determine when the items have been loaded.
    this.itemsLoaded = new Promise((resolve) => {
      this.itemsLoadedResolve = resolve;
    });
  }

  get dataReady() {
    return this.itemsLoaded;
  }

  get defaultSchema() {
    return SelectComponent.schema();
  }

  get emptyValue() {
    return '';
  }

  get inputInfo() {
    const info = super.elementInfo();
    info.type = 'select';
    info.changeEvent = 'change';
    return info;
  }

  get isSelectResource() {
    return this.component.dataSrc === 'resource';
  }

  itemTemplate(data) {
    if (!data) {
      return '';
    }

    // If they wish to show the value in read only mode, then just return the itemValue here.
    if (this.options.readOnly && this.component.readOnlyValue) {
      return this.itemValue(data);
    }

    // Perform a fast interpretation if we should not use the template.
    if (data && !this.component.template) {
      const itemLabel = data.label || data;
      return (typeof itemLabel === 'string') ? this.t(itemLabel) : itemLabel;
    }
    if (typeof data === 'string') {
      return this.t(data);
    }

    const template = this.component.template ? this.interpolate(this.component.template, { item: data }) : data.label;
    if (template) {
      const label = template.replace(/<\/?[^>]+(>|$)/g, '');
      return template.replace(label, this.t(label));
    }
    else {
      return JSON.stringify(data);
    }
  }

  /**
   * @param {*} data
   * @param {boolean} [forceUseValue=false] - if true, return 'value' property of the data
   * @return {*}
   */
  itemValue(data, forceUseValue = false) {
    if (_.isObject(data)) {
      if (this.component.valueProperty) {
        return _.get(data, this.component.valueProperty);
      }

      if (forceUseValue) {
        return data.value;
      }
    }

    return data;
  }

  /**
   * Adds an option to the select dropdown.
   *
   * @param value
   * @param label
   */
  addOption(value, label, attrs = {}) {
    const option = {
      value: value,
      label: label
    };

    if (value) {
      this.selectOptions.push(option);
    }

    if (this.choices || !this.element) {
      return;
    }

    if (this.refs.selectContainer) {
      this.refs.selectContainer.insertAdjacentHTML('beforeend', this.sanitize(this.renderTemplate('selectOption', {
        selected: this.dataValue === option.value,
        option,
        attrs,
      })));
    }
  }

  addValueOptions(items) {
    items = items || [];
    if (!this.selectOptions.length) {
      if (this.choices) {
        // Add the currently selected choices if they don't already exist.
        const currentChoices = Array.isArray(this.dataValue) ? this.dataValue : [this.dataValue];
        return this.addCurrentChoices(currentChoices, items);
      }
      else if (!this.component.multiple) {
        this.addPlaceholder();
      }
    }
    return false;
  }

  /* eslint-disable max-statements */
  setItems(items, fromSearch) {
    // If the items is a string, then parse as JSON.
    if (typeof items == 'string') {
      try {
        items = JSON.parse(items);
      }
      catch (err) {
        console.warn(err.message);
        items = [];
      }
    }

    // Allow js processing (needed for form builder)
    if (this.component.onSetItems && typeof this.component.onSetItems === 'function') {
      const newItems = this.component.onSetItems(this, items);
      if (newItems) {
        items = newItems;
      }
    }

    if (!this.choices && this.refs.selectContainer) {
      if (this.loading) {
        // this.removeChildFrom(this.refs.input[0], this.selectContainer);
      }

      this.empty(this.refs.selectContainer);
    }

    // If they provided select values, then we need to get them instead.
    if (this.component.selectValues) {
      items = _.get(items, this.component.selectValues);
    }

    if (this.isSelectResource) {
      this.serverCount = items.serverCount;
    }

    if (this.isScrollLoading) {
      this.downloadedResources = this.downloadedResources.concat(items);
      this.downloadedResources.serverCount = items.serverCount;
    }
    else {
      this.downloadedResources = items;
      this.selectOptions = [];
    }

    // Add the value options.
    if (!fromSearch) {
      this.addValueOptions(items);
    }

    if (this.component.widget === 'html5' && !this.component.placeholder) {
      this.addOption(null, '');
    }

    // Iterate through each of the items.
    _.each(items, (item) => {
      this.addOption(this.itemValue(item), this.itemTemplate(item));
    });

    if (this.choices) {
      this.choices.setChoices(this.selectOptions, 'value', 'label', true);
    }
    else if (this.loading) {
      // Re-attach select input.
      // this.appendTo(this.refs.input[0], this.selectContainer);
    }

    // We are no longer loading.
    this.isScrollLoading = false;
    this.loading = false;

    // If a value is provided, then select it.
    if (this.dataValue) {
      this.setValue(this.dataValue, true);
    }
    else {
      // If a default value is provided then select it.
      const defaultValue = this.defaultValue;
      if (defaultValue) {
        this.setValue(defaultValue);
      }
    }

    // Say we are done loading the items.
    this.itemsLoadedResolve();
  }
  /* eslint-enable max-statements */

  loadItems(url, search, headers, options, method, body) {
    options = options || {};

    // See if they have not met the minimum search requirements.
    const minSearch = parseInt(this.component.minSearch, 10);
    if (
      this.component.searchField &&
      (minSearch > 0) &&
      (!search || (search.length < minSearch))
    ) {
      // Set empty items.
      return this.setItems([]);
    }

    // Ensure we have a method and remove any body if method is get
    method = method || 'GET';
    if (method.toUpperCase() === 'GET') {
      body = null;
    }

    const limit = this.component.limit || 100;
    const skip = this.isScrollLoading ? this.selectOptions.length : 0;
    const query = (this.component.dataSrc === 'url') ? {} : {
      limit,
      skip,
    };

    // Allow for url interpolation.
    url = this.interpolate(url, {
      formioBase: Formio.getBaseUrl(),
      search,
      limit,
      skip,
      page: Math.abs(Math.floor(skip / limit))
    });

    // Add search capability.
    if (this.component.searchField && search) {
      if (Array.isArray(search)) {
        query[`${this.component.searchField}__in`] = search.join(',');
      }
      else {
        query[`${this.component.searchField}__regex`] = search;
      }
    }

    // If they wish to return only some fields.
    if (this.component.selectFields) {
      query.select = this.component.selectFields;
    }

    // Add sort capability
    if (this.component.sort) {
      query.sort = this.component.sort;
    }

    if (!_.isEmpty(query)) {
      // Add the query string.
      url += (!url.includes('?') ? '?' : '&') + Formio.serialize(query, (item) => this.interpolate(item));
    }

    // Add filter capability
    if (this.component.filter) {
      url += (!url.includes('?') ? '?' : '&') + this.interpolate(this.component.filter);
    }

    // Make the request.
    options.header = headers;
    this.loading = true;
    Formio.makeRequest(this.options.formio, 'select', url, method, body, options)
      .then((response) => {
        this.loading = false;
        this.setItems(response, !!search);
      })
      .catch((err) => {
        this.isScrollLoading = false;
        this.loading = false;
        this.itemsLoadedResolve();
        this.emit('componentError', {
          component: this.component,
          message: err.toString(),
        });
        console.warn(`Unable to load resources for ${this.key}`);
      });
  }

  /**
   * Get the request headers for this select dropdown.
   */
  get requestHeaders() {
    // Create the headers object.
    const headers = new Formio.Headers();

    // Add custom headers to the url.
    if (this.component.data && this.component.data.headers) {
      try {
        _.each(this.component.data.headers, (header) => {
          if (header.key) {
            headers.set(header.key, this.interpolate(header.value));
          }
        });
      }
      catch (err) {
        console.warn(err.message);
      }
    }

    return headers;
  }

  getCustomItems() {
    return this.evaluate(this.component.data.custom, {
      values: []
    }, 'values');
  }

  updateCustomItems() {
    this.setItems(this.getCustomItems() || []);
  }

  refresh(value) {
    if (this.component.lazyLoad) {
      this.activated = false;
      this.loading = true;
      this.setItems([]);
    }

    if (this.component.clearOnRefresh) {
      this.setValue(this.emptyValue);
    }
    this.updateItems(null, true);
  }

  get additionalResourcesAvailable() {
    return _.isNil(this.serverCount) || (this.serverCount > this.downloadedResources.length);
  }

  /* eslint-disable max-statements */
  updateItems(searchInput, forceUpdate) {
    if (!this.component.data) {
      console.warn(`Select component ${this.key} does not have data configuration.`);
      this.itemsLoadedResolve();
      return;
    }

    // Only load the data if it is visible.
    if (!this.checkConditions()) {
      this.itemsLoadedResolve();
      return;
    }

    switch (this.component.dataSrc) {
      case 'values':
        this.component.valueProperty = 'value';
        this.setItems(this.component.data.values);
        break;
      case 'json':
        this.setItems(this.component.data.json);
        break;
      case 'custom':
        this.updateCustomItems();
        break;
      case 'resource': {
        // If there is no resource, or we are lazyLoading, wait until active.
        if (!this.component.data.resource || (!forceUpdate && !this.active)) {
          return;
        }

        let resourceUrl = this.options.formio ? this.options.formio.formsUrl : `${Formio.getProjectUrl()}/form`;
        resourceUrl += (`/${this.component.data.resource}/submission`);

        if (this.additionalResourcesAvailable) {
          try {
            this.loadItems(resourceUrl, searchInput, this.requestHeaders);
          }
          catch (err) {
            console.warn(`Unable to load resources for ${this.key}`);
          }
        }
        else {
          this.setItems(this.downloadedResources);
        }
        break;
      }
      case 'url': {
        if (!forceUpdate && !this.active) {
          // If we are lazyLoading, wait until activated.
          return;
        }
        let { url } = this.component.data;
        let method;
        let body;

        if (url.startsWith('/')) {
          const baseUrl = Formio.getProjectUrl() || Formio.getBaseUrl();
          url = baseUrl + url;
        }

        if (!this.component.data.method) {
          method = 'GET';
        }
        else {
          method = this.component.data.method;
          if (method.toUpperCase() === 'POST') {
            body = this.component.data.body;
          }
          else {
            body = null;
          }
        }
        const options = this.component.authenticate ? {} : { noToken: true };
        this.loadItems(url, searchInput, this.requestHeaders, options, method, body);
        break;
      }
    }
  }
  /* eslint-enable max-statements */

  addPlaceholder() {
    if (!this.component.placeholder) {
      return;
    }

    this.addOption('', this.component.placeholder, { placeholder: true });
  }

  /**
   * Activate this select control.
   */
  activate() {
    if (this.active) {
      return;
    }
    this.activated = true;
    if (this.choices) {
      this.choices.setChoices([{
        value: '',
        label: `<i class="${this.iconClass('refresh')}" style="font-size:1.3em;"></i>`
      }], 'value', 'label', true);
    }
    else {
      this.addOption('', this.t('loading...'));
    }
    this.triggerUpdate();
  }

  get active() {
    return !this.component.lazyLoad || this.activated || this.options.readOnly;
  }

  render() {
    const info = this.inputInfo;
    info.attr = info.attr || {};
    info.multiple = this.component.multiple;
    return super.render(this.wrapElement(this.renderTemplate('select', {
      input: info,
      selectOptions: '',
      index: null,
    })));
  }

  wrapElement(element) {
    return this.component.addResource
      ? (
        this.renderTemplate('resourceAdd', {
          element
        })
      )
      : element;
  }

  /* eslint-disable max-statements */
  attach(element) {
    super.attach(element);
    this.loadRefs(element, {
      selectContainer: 'single',
      addResource: 'single',
    });
    const input = this.refs.selectContainer;
    if (!input) {
      return;
    }
    this.addEventListener(input, this.inputInfo.changeEvent, (event) => {
      // Check if event was fired from removeItem
      const newValue = event.detail.value === this.dataValue ? '' : event.detail.value;
      return this.updateValue({}, newValue);
    });

    if (this.component.widget === 'html5') {
      this.triggerUpdate();
      this.focusableElement = input;
      this.addEventListener(input, 'focus', () => this.update());
      this.addEventListener(input, 'keydown', (event) => {
        const { key } = event;

        if (['Backspace', 'Delete'].includes(key)) {
          this.setValue(null);
        }
      });

      return;
    }

    const useSearch = this.component.hasOwnProperty('searchEnabled') ? this.component.searchEnabled : true;
    const placeholderValue = this.t(this.component.placeholder);
    let customOptions = this.component.customOptions || {};
    if (typeof customOptions == 'string') {
      try {
        customOptions = JSON.parse(customOptions);
      }
      catch (err) {
        console.warn(err.message);
        customOptions = {};
      }
    }

    const choicesOptions = {
      removeItemButton: this.component.disabled ? false : _.get(this.component, 'removeItemButton', true),
      itemSelectText: '',
      classNames: {
        containerOuter: 'choices form-group formio-choices',
        containerInner: this.transform('class', 'form-control ui fluid selection dropdown')
      },
      addItemText: false,
      placeholder: !!this.component.placeholder,
      placeholderValue: placeholderValue,
      noResultsText: this.t('No results found'),
      noChoicesText: this.t('No choices to choose from'),
      searchPlaceholderValue: this.t('Type to search'),
      shouldSort: false,
      position: (this.component.dropdown || 'auto'),
      searchEnabled: useSearch,
      searchChoices: !this.component.searchField,
      searchFields: _.get(this, 'component.searchFields', ['label']),
      fuseOptions: Object.assign({
        include: 'score',
        threshold: _.get(this, 'component.searchThreshold', 0.3),
      }, _.get(this, 'component.fuseOptions', {})),
      itemComparer: _.isEqual,
      resetScrollPosition: false,
      ...customOptions,
    };

    const tabIndex = input.tabIndex;
    this.addPlaceholder();
    input.setAttribute('dir', this.i18next.dir());
    this.choices = new Choices(input, choicesOptions);

    if (this.component.multiple) {
      this.focusableElement = this.choices.input.element;
    }
    else {
      this.focusableElement = this.choices.containerInner.element;
      this.choices.containerOuter.element.setAttribute('tabIndex', '-1');
      if (useSearch) {
        this.addEventListener(this.choices.containerOuter.element, 'focus', () => this.focusableElement.focus());
      }
    }

    if (this.isSelectResource) {
      this.scrollList = this.choices.choiceList.element;
      this.onScroll = () => {
        if (
          !this.isScrollLoading &&
          this.additionalResourcesAvailable &&
          ((this.scrollList.scrollTop + this.scrollList.clientHeight) >= this.scrollList.scrollHeight)
        ) {
          this.isScrollLoading = true;
          this.choices.setChoices([{
            value: `${this.id}-loading`,
            label: 'Loading...',
            disabled: true,
          }], 'value', 'label');
          this.triggerUpdate(this.choices.input.element.value);
        }
      };
      this.scrollList.addEventListener('scroll', this.onScroll);
    }

    this.focusableElement.setAttribute('tabIndex', tabIndex);

    // If a search field is provided, then add an event listener to update items on search.
    if (this.component.searchField) {
      // Make sure to clear the search when no value is provided.
      if (this.choices && this.choices.input && this.choices.input.element) {
        this.addEventListener(this.choices.input.element, 'input', (event) => {
          if (!event.target.value) {
            this.triggerUpdate();
          }
        });
      }
      this.addEventListener(input, 'search', (event) => this.triggerUpdate(event.detail.value));
      this.addEventListener(input, 'stopSearch', () => this.triggerUpdate());
    }

    this.addEventListener(input, 'showDropdown', () => {
      if (this.dataValue) {
        this.triggerUpdate();
      }
      this.update();
    });

    if (placeholderValue && this.choices._isSelectOneElement) {
      this.addEventListener(input, 'removeItem', () => {
        const items = this.choices._store.activeItems;
        if (!items.length) {
          this.choices._addItem({
            value: placeholderValue,
            label: placeholderValue,
            choiceId: 0,
            groupId: -1,
            customProperties: null,
            placeholder: true,
            keyCode: null });
        }
      });
    }

    // Add value options.
    if (this.addValueOptions()) {
      this.choices.setChoiceByValue(this.dataValue);
      // this.restoreValue();
    }

    if (this.isSelectResource && this.refs.addResource) {
      this.addEventListener(this.refs.addResource, 'click', (event) => {
        event.preventDefault();

        const formioForm = this.ce('div');
        const dialog = this.createModal(formioForm);

        const projectUrl = _.get(this.root, 'formio.projectUrl', Formio.getBaseUrl());
        const formUrl = `${projectUrl}/form/${this.component.data.resource}`;
        new Form(formioForm, formUrl, {}).ready
          .then((form) => {
            form.on('submit', (submission) => {
              this.setValue(submission);
              dialog.close();
            });
          });
      });
    }

    // Force the disabled state with getters and setters.
    this.disabled = this.disabled;
    this.triggerUpdate();
  }

  /* eslint-enable max-statements */

  update() {
    if (this.component.dataSrc === 'custom') {
      this.updateCustomItems();
    }

    // Activate the control.
    this.activate();
  }

  set disabled(disabled) {
    super.disabled = disabled;
    if (!this.choices) {
      return;
    }
    if (disabled) {
      this.setDisabled(this.choices.containerInner.element, true);
      this.focusableElement.removeAttribute('tabIndex');
      this.choices.disable();
    }
    else {
      this.setDisabled(this.choices.containerInner.element, false);
      this.focusableElement.setAttribute('tabIndex', this.component.tabindex || 0);
      this.choices.enable();
    }
  }

  set visible(value) {
    // If we go from hidden to visible, trigger a refresh.
    if (value && (!this._visible !== !value)) {
      this.triggerUpdate();
    }
    super.visible = value;
  }

  get visible() {
    return super.visible;
  }

  /**
   * @param {*} value
   * @param {Array} items
   */
  addCurrentChoices(values, items, keyValue) {
    if (!values) {
      return false;
    }
    const notFoundValuesToAdd = [];
    const added = values.reduce((defaultAdded, value) => {
      if (!value) {
        return defaultAdded;
      }
      let found = false;

      // Make sure that `items` and `this.selectOptions` points
      // to the same reference. Because `this.selectOptions` is
      // internal property and all items are populated by
      // `this.addOption` method, we assume that items has
      // 'label' and 'value' properties. This assumption allows
      // us to read correct value from the item.
      const isSelectOptions = items === this.selectOptions;
      if (items && items.length) {
        _.each(items, (choice) => {
          if (choice._id && value._id && (choice._id === value._id)) {
            found = true;
            return false;
          }
          const itemValue = keyValue ? choice.value : this.itemValue(choice, isSelectOptions);
          found |= _.isEqual(itemValue, value);
          return found ? false : true;
        });
      }

      // Add the default option if no item is found.
      if (!found) {
        notFoundValuesToAdd.push({
          value: this.itemValue(value),
          label: this.itemTemplate(value)
        });
        return true;
      }
      return found || defaultAdded;
    }, false);

    if (notFoundValuesToAdd.length) {
      if (this.choices) {
        this.choices.setChoices(notFoundValuesToAdd, 'value', 'label');
      }
      else {
        notFoundValuesToAdd.map(notFoundValue => {
          this.addOption(notFoundValue.value, notFoundValue.label);
        });
      }
    }
    return added;
  }

  getView(data) {
    return (this.component.multiple && Array.isArray(data))
      ? data.map(this.asString.bind(this)).join(', ')
      : this.asString(data);
  }

  getValue() {
    if (this.viewOnly || this.loading || !this.selectOptions.length) {
      return this.dataValue;
    }
    let value = '';
    if (this.choices) {
      value = this.choices.getValue(true);

      // Make sure we don't get the placeholder
      if (
        !this.component.multiple &&
        this.component.placeholder &&
        (value === this.t(this.component.placeholder))
      ) {
        value = '';
      }
    }
    else {
      const values = [];
      _.each(this.selectOptions, (selectOption) => {
        if (selectOption.element && selectOption.element.selected) {
          values.push(selectOption.value);
        }
      });
      value = this.component.multiple ? values : values.shift();
    }
    // Choices will return undefined if nothing is selected. We really want '' to be empty.
    if (value === undefined || value === null || value === '') {
      value = this.dataValue;
    }
    return value;
  }

  redraw() {
    super.redraw();
    this.triggerUpdate();
  }

  setValue(value, flags) {
    flags = this.getFlags.apply(this, arguments);
    const previousValue = this.dataValue;
    if (this.component.multiple && !Array.isArray(value)) {
      value = value ? [value] : [];
    }
    const hasPreviousValue = Array.isArray(previousValue) ? previousValue.length : previousValue;
    const hasValue = Array.isArray(value) ? value.length : value;
    const changed = this.hasChanged(value, previousValue);
    this.dataValue = value;

    // Do not set the value if we are loading... that will happen after it is done.
    if (this.loading) {
      return changed;
    }

    // Determine if we need to perform an initial lazyLoad api call if searchField is provided.
    if (
      this.component.searchField &&
      this.component.lazyLoad &&
      !this.lazyLoadInit &&
      !this.active &&
      !this.selectOptions.length &&
      hasValue
    ) {
      this.loading = true;
      this.lazyLoadInit = true;
      this.triggerUpdate(this.dataValue, true);
      return changed;
    }

    // Add the value options.
    this.addValueOptions();

    if (this.choices) {
      // Now set the value.
      if (hasValue) {
        this.choices.removeActiveItems();
        // Add the currently selected choices if they don't already exist.
        const currentChoices = Array.isArray(this.dataValue) ? this.dataValue : [this.dataValue];
        if (!this.addCurrentChoices(currentChoices, this.selectOptions, true)) {
          this.choices.setChoices(this.selectOptions, 'value', 'label', true);
        }
        this.choices.setChoiceByValue(value);
      }
      else if (hasPreviousValue) {
        this.choices.removeActiveItems();
      }
    }
    else {
      if (hasValue) {
        const values = Array.isArray(value) ? value : [value];
        _.each(this.selectOptions, (selectOption) => {
          _.each(values, (val) => {
            if (_.isEqual(val, selectOption.value) && selectOption.element) {
              selectOption.element.selected = true;
              selectOption.element.setAttribute('selected', 'selected');
              return false;
            }
          });
        });
      }
      else {
        _.each(this.selectOptions, (selectOption) => {
          if (selectOption.element) {
            selectOption.element.selected = false;
            selectOption.element.removeAttribute('selected');
          }
        });
      }
    }

    this.updateOnChange(flags, changed);
    return changed;
  }

  /**
   * Deletes the value of the component.
   */
  deleteValue() {
    this.setValue('', {
      noUpdateEvent: true
    });
    _.unset(this.data, this.key);
  }

  /**
   * Check if a component is eligible for multiple validation
   *
   * @return {boolean}
   */
  validateMultiple() {
    // Select component will contain one input when flagged as multiple.
    return false;
  }

  /**
   * Ouput this select dropdown as a string value.
   * @return {*}
   */
  asString(value) {
    value = value || this.getValue();

    if (['values', 'custom'].includes(this.component.dataSrc)) {
      const {
        items,
        valueProperty,
      } = this.component.dataSrc === 'values'
        ? {
          items: this.component.data.values,
          valueProperty: 'value',
        }
        : {
          items: this.getCustomItems(),
          valueProperty: this.component.valueProperty,
        };

      value = (this.component.multiple && Array.isArray(value))
        ? _.filter(items, (item) => value.includes(item.value))
        : valueProperty
          ? _.find(items, [valueProperty, value])
          : value;
    }

    if (_.isString(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      const items = [];
      value.forEach(item => items.push(this.itemTemplate(item)));
      return items.length > 0 ? items.join('<br />') : '-';
    }

    return !_.isNil(value)
      ? this.itemTemplate(value)
      : '-';
  }

  detach() {
    super.detach();
    if (this.choices) {
      this.choices.destroyed = true;
      this.choices.destroy();
      this.choices = null;
    }
  }

  focus() {
    this.focusableElement.focus();
  }

  setCustomValidity(message, dirty) {
    if (this.refs.messageContainer) {
      this.empty(this.refs.messageContainer);
    }
    if (!this.refs.selectContainer) {
      return;
    }
    if (message) {
      this.error = {
        component: this.component,
        message: message
      };
      this.emit('componentError', this.error);
      this.addInputError(message, dirty, [this.refs.selectContainer]);
    }
    else {
      this.removeClass(this.refs.selectContainer, 'is-invalid');
      this.removeClass(this.element, 'alert alert-danger');
      this.removeClass(this.element, 'has-error');
      this.error = null;
    }
  }
}
