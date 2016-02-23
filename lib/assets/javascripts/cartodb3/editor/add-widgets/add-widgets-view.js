var _ = require('underscore');
var Backbone = require('backbone');
var cdb = require('cartodb.js');
var LoadingView = require('../../components/loading/loading-view');
var createTuplesItems = require('./create-tuples-items');
var widgetsTypes = require('./widgets-types');
var BodyView = require('./body-view');
var template = require('./add-widgets.tpl');

/**
 * View to add new widgets.
 * Expected to be rendered in a modal.
 *
 * The widget options to choose from needs to be calculated from columns derived from the available layers,
 * which may be async, so the actual options can not be created until after the layers' columns are fetched.
 */
module.exports = cdb.core.View.extend({
  className: 'Dialog-content Dialog-content--expanded',

  events: {
    'click .js-continue': '_onContinue'
  },

  initialize: function (opts) {
    if (!opts.modalModel) throw new Error('modalModel is required');
    if (!opts.layerDefinitionsCollection) throw new Error('layerDefinitionsCollection is required');
    if (!opts.widgetDefinitionsCollection) throw new Error('widgetDefinitionsCollection is required');

    this._modalModel = opts.modalModel;
    this._layerDefinitionsCollection = opts.layerDefinitionsCollection;
    this._widgetDefinitionsCollection = opts.widgetDefinitionsCollection;
    this._optionsCollection = new Backbone.Collection();

    if (!this._hasFetchedAllLayerTables()) {
      var isNotFetched = _.compose(_.negate(Boolean), this._isFetched);
      this._layerTablesChain()
        .filter(isNotFetched)
        .each(function (m) {
          this.listenToOnce(m, 'change:fetched', this._onLayerTableFetched);
          m.fetch();
        }, this);
    }

    this.listenTo(this._optionsCollection, 'change:selected', this._onSelectedChange);
  },

  render: function () {
    this.clearSubViews();
    this.$el.html(template());

    var view = new LoadingView({
      el: this.$('.js-body'),
      title: _t('editor.add-widgets.fetching-title'),
      predicate: this._hasFetchedAllLayerTables.bind(this),
      createContentView: this._newBodyView.bind(this)
    });
    this.addView(view);
    view.render();

    return this;
  },

  _onContinue: function () {
    var selectedOptionModels = this._optionsCollection.filter(this._isSelected);
    if (selectedOptionModels.length > 0) {
      _.map(selectedOptionModels, function (m) {
        var attrs = m.getWidgetDefinitionAttrs();
        this._widgetDefinitionsCollection.create(attrs, { wait: true });
      }, this);
      // for now assumes all widgets are created fine
      // TODO show loading again, indicate creation status
      // TODO error handling
      this._modalModel.destroy();
    }
  },

  _isFetched: function (m) {
    return !!m.get('fetched');
  },

  _hasFetchedAllLayerTables: function () {
    return this._layerTablesChain()
      .all(this._isFetched)
      .value();
  },

  _layerTablesChain: function () {
    return this._layerDefinitionsCollection
      .chain()
      .reduce(function (memo, m) {
        if (m.layerTableModel) {
          memo.push(m.layerTableModel);
        }
        return memo;
      }, []);
  },

  _onLayerTableFetched: function () {
    if (this._hasFetchedAllLayerTables()) {
      this.render();
    }
  },

  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.el
   */
  _newBodyView: function (opts) {
    this._createOptionsModels();
    return new BodyView({
      el: opts.el,
      optionsCollection: this._optionsCollection,
      widgetsTypes: widgetsTypes
    });
  },

  _onSelectedChange: function () {
    this.$('.js-continue').toggleClass('is-disabled', !this._optionsCollection.any(this._isSelected));
  },

  _isSelected: function (m) {
    return !!m.get('selected');
  },

  _createOptionsModels: function () {
    var tuplesItems = createTuplesItems(this._layerDefinitionsCollection);

    _.each(widgetsTypes, function (d) {
      _.each(tuplesItems, function (tuples) {
        var models = d.createOptionModels(tuples);
        this._optionsCollection.add(models);
      }, this);
    }, this);
  }

});