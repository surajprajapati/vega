import {Transform} from 'vega-dataflow';
import {Bounds, boundStroke} from 'vega-scenegraph';
import {inherits} from 'vega-util';

export var Fit = 'fit';
export var Pad = 'pad';
export var None = 'none';

var AxisRole = 'axis',
    LegendRole = 'legend',
    ScopeRole = 'scope';

/**
 * Layout view elements such as axes and legends.
 * Also performs size adjustments.
 * @constructor
 * @param {object} params - The parameters for this operator.
 * @param {object} params.mark - Scenegraph mark of groups to layout.
 */
export default function ViewLayout(params) {
  Transform.call(this, null, params);
}

var prototype = inherits(ViewLayout, Transform);

prototype.transform = function(_, pulse) {
  // TODO incremental update, output?
  var view = pulse.dataflow;
  _.mark.items.forEach(function(group) {
    layoutGroup(view, group, _);
  });
  return pulse;
};

function layoutGroup(view, group, _) {
  var items = group.items,
      width = Math.max(0, group.width || 0),
      height = Math.max(0, group.height || 0),
      viewBounds = new Bounds().set(0, 0, width, height),
      markBounds = viewBounds.clone(),
      axisBounds = markBounds.clone(),
      legends = [],
      mark, margin, i, n;

  // layout axes, gather legends, collect bounds
  for (i=0, n=items.length; i<n; ++i) {
    mark = items[i];
    switch (mark.role) {
      case AxisRole:
        axisBounds.union(layoutAxis(mark, width, height));
        break;
      case LegendRole: legends.push(mark); break;
      case ScopeRole:  viewBounds.union(mark.bounds); // break omitted
      default:         markBounds.union(mark.bounds);
    }
  }
  viewBounds.union(axisBounds);

  // layout legends, extending viewBounds
  if (legends.length) {
    margin = _.legendMargin || 8;
    axisBounds.union(markBounds);
    layoutLegends(legends, axisBounds, margin, width, height, viewBounds);
  }

  // perform size adjustment
  layoutSize(view, group, markBounds, viewBounds, _);
}

function layoutAxis(axis, width, height) {
  var item = axis.items[0],
      datum = item.datum,
      orient = datum.orient,
      ticksIndex = datum.grid ? 1 : 0,
      labelIndex = ticksIndex + 1,
      titleIndex = labelIndex + (datum.domain ? 2 : 1),
      offset = item.offset,
      minExtent = item.minExtent,
      maxExtent = item.maxExtent,
      title = datum.title && item.items[titleIndex].items[0],
      titlePadding = item.titlePadding,
      titleSize = title ? title.fontSize + titlePadding : 0,
      bounds = item.bounds,
      x, y, s;

  bounds.clear()
    .union(item.items[ticksIndex].bounds)
    .union(item.items[labelIndex].bounds);

  // position axis group and title
  // TODO: ignore title positioning if user-specified
  switch (orient) {
    case 'top': {
      x = 0;
      y = -offset;
      s = Math.max(minExtent, Math.min(maxExtent, offset - bounds.y1));
      if (title) {
        title.y = -(titlePadding + s);
        s += titleSize;
      }
      bounds.add(0, -s).add(width, 0);
      break;
    }
    case 'left': {
      x = -offset;
      y = 0;
      s = Math.max(minExtent, Math.min(maxExtent, offset - bounds.x1));
      if (title) {
        title.x = -(titlePadding + s);
        s += titleSize;
      }
      bounds.add(-s, 0).add(0, height);
      break;
    }
    case 'right': {
      y = 0;
      x = offset + width;
      s = Math.max(minExtent, Math.min(maxExtent, offset + bounds.x2));
      if (title) {
        title.x = titlePadding + s;
        s += titleSize;
      }
      bounds.add(width, 0).add(width + s, height);
      break;
    }
    case 'bottom': {
      x = 0;
      y = offset + height;
      s = Math.max(minExtent, Math.min(maxExtent, offset + bounds.y2));
      if (title) {
        title.y = titlePadding + s;
        s += titleSize;
      }
      bounds.add(0, height).add(width, height + s);
      break;
    }
  }

  item.x = x + 0.5;
  item.y = y + 0.5;

  // update bounds
  boundStroke(bounds, item);
  item.mark.bounds.clear().union(bounds);
  return bounds;
}

function layoutLegends(legends, axisBounds, margin, width, height, output) {
  var flow = {left: 0, right: 0, margin: margin},
      n = legends.length, i = 0, b;

  // layout legends
  for (; i<n; ++i) {
    b = layoutLegend(legends[i], flow, axisBounds, width, height);
    output.add(b.x1, 0).add(b.x2, 0);
  }
}

function layoutLegend(legend, flow, axisBounds, width, height) {
  var item = legend.items[0],
      datum = item.datum,
      orient = datum.orient,
      offset = item.offset,
      bounds = item.bounds.clear(),
      x = 0,
      y = (flow[orient] || 0),
      w, h;

  // aggregate bounds to determine size
  // shave off 1 pixel because it looks better...
  item.items.forEach(function(_) { bounds.union(_.bounds); });
  w = Math.round(bounds.width()) + 2 * item.padding - 1;
  h = Math.round(bounds.height()) + 2 * item.padding - 1;

  switch (orient) {
    case 'left':
      x -= w + offset - Math.floor(axisBounds.x1);
      flow.left += h + flow.margin;
      break;
    case 'right':
      x += offset + Math.ceil(axisBounds.x2);
      flow.right += h + flow.margin;
      break;
    case 'top-left':
      x += offset;
      y += offset;
      break;
    case 'top-right':
      x += width - w - offset;
      y += offset;
      break;
    case 'bottom-left':
      x += offset;
      y += height - h - offset;
      break;
    case 'bottom-right':
      x += width - w - offset;
      y += height - h - offset;
      break;
  }

  // update legend layout
  item.x = x;
  item.y = y;
  item.width = w;
  item.height = h;

  // update bounds
  boundStroke(bounds.set(x, y, x + w, y + h), item);
  item.mark.bounds.clear().union(bounds);
  return bounds;
}

function layoutSize(view, group, markBounds, viewBounds, _) {
  var type = _.autosize,
      viewWidth = view._width,
      viewHeight = view._height;

  if (view._autosize < 1 || !type || type === None) return;

  var width  = Math.max(0, group.width || 0),
      left   = Math.max(0, Math.ceil(-viewBounds.x1)),
      right  = Math.max(0, Math.ceil(viewBounds.x2 - width)),
      height = Math.max(0, group.height || 0),
      top    = Math.max(0, Math.ceil(-viewBounds.y1)),
      bottom = Math.max(0, Math.ceil(viewBounds.y2 - height));

  if (type === Fit) {
    width = Math.max(0, viewWidth - left - right);
    height = Math.max(0, viewHeight - top - bottom);
  }

  else if (type === Pad) {
    viewWidth = width + left + right;
    viewHeight = height + top + bottom;
    if (group.width  < 0) width = markBounds.width();
    if (group.height < 0) height = markBounds.height();
  }

  view.autosize(viewWidth, viewHeight, width, height, [left, top]);
}
