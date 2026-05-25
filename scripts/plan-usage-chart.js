(function () {
    var DERIVED_FILE_PATH = './index-usage-derived.json';
    var panel = document.getElementById('planUsagePanel');
    var stateEl = document.getElementById('planUsageState');
    var valueChartEl = document.getElementById('planUsageValueChart');
    var costChartEl = document.getElementById('planUsageCostChart');
    var windowButtons = Array.prototype.slice.call(document.querySelectorAll('[data-usage-window]'));
    var valueMetricButtons = Array.prototype.slice.call(document.querySelectorAll('[data-usage-value-metric]'));
    var valueTitleEl = document.getElementById('planUsageValueTitle');
    var valueSubtitleEl = document.getElementById('planUsageValueSubtitle');
    var currentWindow = 'monthly';
    var currentValueMetric = 'tokenPerCny';
    var valueChart = null;
    var costChart = null;
    var usagePayload = null;

    function escapeHtmlSafe(text) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(text);
        }
        var div = document.createElement('div');
        div.textContent = String(text == null ? '' : text);
        return div.innerHTML;
    }

    function formatDate(isoString) {
        if (!isoString) {
            return '未知';
        }
        var date = new Date(isoString);
        if (Number.isNaN(date.getTime())) {
            return isoString;
        }
        return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('.');
    }

    function formatInteger(value) {
        return Number(value || 0).toLocaleString('zh-CN');
    }

    function formatPrice(value) {
        var number = Number(value || 0);
        return Number.isInteger(number) ? String(number) : number.toFixed(2);
    }

    function getValueMetricNumber(windowMetrics) {
        if (currentValueMetric === 'cnyPerMillionTokens') {
            var tokenPerCny = Number(windowMetrics.tokenPerCny || 0);
            if (tokenPerCny <= 0) {
                return 0;
            }
            return 1000000 / tokenPerCny;
        }
        return Number(windowMetrics.tokenPerCny || 0);
    }

    function formatValueMetric(value) {
        if (currentValueMetric === 'cnyPerMillionTokens') {
            return '¥' + formatPrice(value);
        }
        return formatCompactTokens(value);
    }

    function getValueMetricSeriesName() {
        if (currentValueMetric === 'cnyPerMillionTokens') {
            return '1M Token 价格';
        }
        return '每元 Token';
    }

    function getValueMetricTitle() {
        if (currentValueMetric === 'cnyPerMillionTokens') {
            return '不同平台不同套餐，买 1M Token 需要多少钱';
        }
        return '不同平台不同套餐，每 1 元人民币能换来多少 Token';
    }

    function getValueMetricSubtitle() {
        if (currentValueMetric === 'cnyPerMillionTokens') {
            return '按平台看 1M Token 成本，纵轴越低，代表买到同等 token 所需预算越少。';
        }
        return '按平台看性价比密度，纵轴越高，代表同样预算下可支持的 token 越多。';
    }

    function getValueMetricTooltipLabel() {
        if (currentValueMetric === 'cnyPerMillionTokens') {
            return '1M Token 价格';
        }
        return getWindowLabel(currentWindow) + ' 每元 Token';
    }

    function getValueMetricYAxisName() {
        if (currentValueMetric === 'cnyPerMillionTokens') {
            return '1M Token 价格（元）';
        }
        return getWindowLabel(currentWindow) + ' 每元 Token';
    }

    function formatCompactTokens(value) {
        var numeric = Number(value || 0);
        if (!Number.isFinite(numeric)) {
            return '-';
        }
        var absValue = Math.abs(numeric);
        if (absValue >= 100000000) {
            return (numeric / 100000000).toFixed(absValue >= 1000000000 ? 1 : 2).replace(/\.0$/, '') + '亿';
        }
        if (absValue >= 10000) {
            return (numeric / 10000).toFixed(absValue >= 1000000 ? 1 : 2).replace(/\.0$/, '') + '万';
        }
        return Math.round(numeric).toLocaleString('zh-CN');
    }

    function getWindowLabel(windowKey) {
        if (windowKey === 'weekly') {
            return '每周';
        }
        if (windowKey === 'monthly') {
            return '每月';
        }
        return '5 小时';
    }

    function buildVendorPalette(items) {
        var vendors = Array.from(new Set(items.map(function (item) {
            return item.vendor;
        })));
        var palette = ['#0f766e', '#c66b1a', '#1d4ed8', '#be123c', '#7c3aed', '#0369a1', '#b45309', '#047857'];
        var colorMap = {};
        vendors.forEach(function (vendor, vendorIndex) {
            colorMap[vendor] = palette[vendorIndex % palette.length];
        });
        return colorMap;
    }

    function computeThresholdPivot(values, direction) {
        if (!values.length) {
            return 0;
        }
        var sorted = values.slice().sort(function (left, right) {
            return left - right;
        });
        var middleIndex = Math.floor((sorted.length - 1) / 2);
        var fallbackStep = Math.max(Math.abs(sorted[middleIndex]) * 0.001, 0.001);

        if (direction === 'lower') {
            var lowerBaseIndex = Math.ceil((sorted.length - 1) / 2);
            var lowerBaseValue = sorted[lowerBaseIndex];
            for (var prevIndex = lowerBaseIndex - 1; prevIndex >= 0; prevIndex -= 1) {
                if (sorted[prevIndex] !== lowerBaseValue) {
                    return (sorted[prevIndex] + lowerBaseValue) / 2;
                }
            }
            return Math.max(0, lowerBaseValue - fallbackStep);
        }

        var higherBaseValue = sorted[middleIndex];
        for (var nextIndex = middleIndex + 1; nextIndex < sorted.length; nextIndex += 1) {
            if (sorted[nextIndex] !== higherBaseValue) {
                return (higherBaseValue + sorted[nextIndex]) / 2;
            }
        }
        return higherBaseValue + fallbackStep;
    }

    function buildCenteredOffsets(count, gap) {
        return Array.from({ length: count }, function (_, index) {
            return Math.round((index - (count - 1) / 2) * gap);
        });
    }

    function applyVerticalLabelStack(points, getY, threshold) {
        if (!points.length) {
            return;
        }

        var sorted = points.slice().sort(function (left, right) {
            return getY(left) - getY(right);
        });
        var clusters = [];
        var currentCluster = [];

        sorted.forEach(function (point) {
            if (!currentCluster.length) {
                currentCluster.push(point);
                return;
            }

            var previousPoint = currentCluster[currentCluster.length - 1];
            if (Math.abs(getY(point) - getY(previousPoint)) <= threshold) {
                currentCluster.push(point);
                return;
            }

            clusters.push(currentCluster);
            currentCluster = [point];
        });

        if (currentCluster.length) {
            clusters.push(currentCluster);
        }

        clusters.forEach(function (cluster) {
            var offsets = buildCenteredOffsets(cluster.length, 18);
            cluster.forEach(function (point, index) {
                point.label = {
                    position: 'right',
                    offset: [12, offsets[index]]
                };
            });
        });
    }

    function getScatterLabelPlacement(index) {
        var placements = [
            { position: 'right', offset: [12, -18] },
            { position: 'right', offset: [12, 18] },
            { position: 'top', offset: [0, -12] },
            { position: 'bottom', offset: [0, 12] },
            { position: 'left', offset: [-12, -18] },
            { position: 'left', offset: [-12, 18] },
            { position: 'right', offset: [12, 34] },
            { position: 'left', offset: [-12, 34] }
        ];
        return placements[index % placements.length];
    }

    function flipHorizontalPlacement(placement) {
        if (placement.position === 'right') {
            return {
                position: 'left',
                offset: [-Math.abs(placement.offset[0]), placement.offset[1]]
            };
        }
        if (placement.position === 'left') {
            return {
                position: 'right',
                offset: [Math.abs(placement.offset[0]), placement.offset[1]]
            };
        }
        return placement;
    }

    function flipVerticalPlacement(placement) {
        if (placement.position === 'top') {
            return {
                position: 'bottom',
                offset: [placement.offset[0], Math.abs(placement.offset[1])]
            };
        }
        if (placement.position === 'bottom') {
            return {
                position: 'top',
                offset: [placement.offset[0], -Math.abs(placement.offset[1])]
            };
        }
        return {
            position: placement.position,
            offset: [placement.offset[0], -placement.offset[1]]
        };
    }

    function applyScatterLabelPlacements(points, getX, getY, xThreshold, yThreshold) {
        if (!points.length) {
            return;
        }

        var xValues = points.map(function (point) {
            return getX(point);
        });
        var yValues = points.map(function (point) {
            return getY(point);
        });
        var minX = Math.min.apply(null, xValues);
        var maxX = Math.max.apply(null, xValues);
        var minY = Math.min.apply(null, yValues);
        var maxY = Math.max.apply(null, yValues);

        var clusters = [];

        points.forEach(function (point) {
            var pointX = getX(point);
            var pointY = getY(point);
            var matchedCluster = null;

            clusters.some(function (cluster) {
                var isNearCluster = cluster.points.some(function (clusterPoint) {
                    return Math.abs(getX(clusterPoint) - pointX) <= xThreshold
                        && Math.abs(getY(clusterPoint) - pointY) <= yThreshold;
                });
                if (isNearCluster) {
                    matchedCluster = cluster;
                    return true;
                }
                return false;
            });

            if (!matchedCluster) {
                matchedCluster = { points: [] };
                clusters.push(matchedCluster);
            }

            matchedCluster.points.push(point);
        });

        clusters.forEach(function (cluster) {
            if (cluster.points.length === 1) {
                var singlePointPlacement = {
                    position: 'right',
                    offset: [12, 0]
                };
                if (maxX - getX(cluster.points[0]) <= xThreshold * 1.25) {
                    singlePointPlacement = flipHorizontalPlacement(singlePointPlacement);
                }
                if (getY(cluster.points[0]) - minY <= yThreshold * 1.25 && singlePointPlacement.offset[1] > 0) {
                    singlePointPlacement = flipVerticalPlacement(singlePointPlacement);
                } else if (maxY - getY(cluster.points[0]) <= yThreshold * 1.25 && singlePointPlacement.offset[1] < 0) {
                    singlePointPlacement = flipVerticalPlacement(singlePointPlacement);
                }
                cluster.points[0].label = singlePointPlacement;
                return;
            }

            cluster.points.sort(function (left, right) {
                var yDiff = getY(right) - getY(left);
                if (yDiff !== 0) {
                    return yDiff;
                };
                return getX(left) - getX(right);
            });

            cluster.points.forEach(function (point, index) {
                var placement = getScatterLabelPlacement(index);
                if (maxX - getX(point) <= xThreshold * 1.25 && placement.position === 'right') {
                    placement = flipHorizontalPlacement(placement);
                } else if (getX(point) - minX <= xThreshold * 1.25 && placement.position === 'left') {
                    placement = flipHorizontalPlacement(placement);
                }
                if (getY(point) - minY <= yThreshold * 1.25) {
                    if (placement.position === 'bottom' || placement.offset[1] > 0) {
                        placement = flipVerticalPlacement(placement);
                    }
                } else if (maxY - getY(point) <= yThreshold * 1.25) {
                    if (placement.position === 'top' || placement.offset[1] < 0) {
                        placement = flipVerticalPlacement(placement);
                    }
                }
                point.label = {
                    position: placement.position,
                    offset: placement.offset
                };
            });
        });
    }

    function setState(message, isError) {
        if (!stateEl) {
            return;
        }
        if (!message) {
            stateEl.hidden = true;
            stateEl.textContent = '';
            stateEl.classList.remove('is-error');
            return;
        }
        stateEl.hidden = false;
        stateEl.textContent = message;
        stateEl.classList.toggle('is-error', Boolean(isError));
    }

    function setButtonState(nextWindow) {
        currentWindow = nextWindow;
        windowButtons.forEach(function (button) {
            var isActive = button.getAttribute('data-usage-window') === nextWindow;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function setValueMetricState(nextMetric) {
        currentValueMetric = nextMetric;
        valueMetricButtons.forEach(function (button) {
            var isActive = button.getAttribute('data-usage-value-metric') === nextMetric;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        if (valueTitleEl) {
            valueTitleEl.textContent = getValueMetricTitle();
        }
        if (valueSubtitleEl) {
            valueSubtitleEl.textContent = getValueMetricSubtitle();
        }
    }

    function buildValueSeries(items, colorMap) {
        var vendors = Array.from(new Set(items.map(function (item) {
            return item.vendor;
        })));
        var points = items.map(function (item) {
            var windowMetrics = item.windows[currentWindow] || {};
            var metricValue = getValueMetricNumber(windowMetrics);
            return {
                value: [item.vendor, metricValue],
                vendor: item.vendor,
                plan: item.plan,
                monthlyPrice: item.monthlyPrice,
                seedPlan: item.seedPlan,
                seedSourceNote: item.seedSourceNote,
                fiveHours: item.windows.fiveHours,
                weekly: item.windows.weekly,
                monthly: item.windows.monthly,
                itemStyle: {
                    color: colorMap[item.vendor],
                    borderColor: 'rgba(255,255,255,0.95)',
                    borderWidth: 1.5,
                    shadowBlur: 14,
                    shadowColor: 'rgba(23, 32, 51, 0.12)'
                }
            };
        });
        var tokenValues = points.map(function (point) {
            return Number(point.value[1] || 0);
        });
        var minTokenValue = tokenValues.length ? Math.min.apply(null, tokenValues) : 0;
        var maxTokenValue = tokenValues.length ? Math.max.apply(null, tokenValues) : 0;
        var tokenThreshold = Math.max((maxTokenValue - minTokenValue) * 0.015, currentValueMetric === 'cnyPerMillionTokens' ? 0.2 : 5000);

        vendors.forEach(function (vendor) {
            applyVerticalLabelStack(points.filter(function (point) {
                return point.vendor === vendor;
            }), function (point) {
                return Number(point.value[1] || 0);
            }, tokenThreshold);
        });

        return {
            vendors: vendors,
            points: points
        };
    }

    function buildCostSeries(items, colorMap) {
        var grouped = new Map();
        items.forEach(function (item) {
            if (!grouped.has(item.vendor)) {
                grouped.set(item.vendor, []);
            }
            grouped.get(item.vendor).push(item);
        });

        var vendors = Array.from(grouped.keys());
        var priceValues = [];
        var tokenValues = [];
        var series = vendors.map(function (vendor, vendorIndex) {
            var points = (grouped.get(vendor) || []).map(function (item) {
                var windowMetrics = item.windows[currentWindow] || {};
                var monthlyPrice = Number(item.monthlyPrice || 0);
                var tokenLimit = Number(windowMetrics.tokenLimit || 0);
                priceValues.push(monthlyPrice);
                tokenValues.push(tokenLimit);
                return {
                    value: [monthlyPrice, tokenLimit],
                    vendor: item.vendor,
                    plan: item.plan,
                    monthlyPrice: item.monthlyPrice,
                    seedPlan: item.seedPlan,
                    seedSourceNote: item.seedSourceNote,
                    fiveHours: item.windows.fiveHours,
                    weekly: item.windows.weekly,
                    monthly: item.windows.monthly,
                    itemStyle: {
                        color: colorMap[vendor],
                        borderColor: 'rgba(255,255,255,0.95)',
                        borderWidth: 1.5,
                        shadowBlur: 14,
                        shadowColor: 'rgba(23, 32, 51, 0.12)'
                    }
                };
            });
            return {
                name: vendor,
                type: 'scatter',
                color: colorMap[vendor],
                symbolSize: 16,
                label: {
                    show: true,
                    position: 'right',
                    distance: 8,
                    color: '#425065',
                    fontSize: 11,
                    fontWeight: 700,
                    formatter: function (params) {
                        var data = params.data || {};
                        return [data.vendor, data.plan].filter(Boolean).join(' · ');
                    }
                },
                itemStyle: {
                    color: colorMap[vendor],
                    borderColor: 'rgba(255,255,255,0.95)',
                    borderWidth: 1.5,
                    shadowBlur: 14,
                    shadowColor: 'rgba(23, 32, 51, 0.12)'
                },
                data: points,
                emphasis: {
                    scale: 1.18
                }
            };
        });

        var xMin = priceValues.length ? Math.max(1, Math.floor(Math.min.apply(null, priceValues) * 0.75)) : 1;
        var xMax = priceValues.length ? Math.ceil(Math.max.apply(null, priceValues) * 1.12) : 1;
        var yMaxValue = tokenValues.length ? Math.max.apply(null, tokenValues) : 0;
        var yMax = yMaxValue > 0 ? Math.ceil(yMaxValue * 1.18) : 1;
        var medianPrice = computeThresholdPivot(priceValues, 'higher');
        var medianTokens = computeThresholdPivot(tokenValues, 'lower');
        var logPriceValues = priceValues.map(function (value) {
            return Math.log(Math.max(1, value)) / Math.log(2);
        });
        var minLogPrice = logPriceValues.length ? Math.min.apply(null, logPriceValues) : 0;
        var maxLogPrice = logPriceValues.length ? Math.max.apply(null, logPriceValues) : 0;
        var xThreshold = Math.max((maxLogPrice - minLogPrice) * 0.035, 0.08);
        var yThreshold = Math.max(yMax * 0.02, 1);

        applyScatterLabelPlacements(series.reduce(function (result, seriesItem) {
            return result.concat(seriesItem.data || []);
        }, []), function (point) {
            return Math.log(Math.max(1, Number(point.value[0] || 1))) / Math.log(2);
        }, function (point) {
            return Number(point.value[1] || 0);
        }, xThreshold, yThreshold);

        if (series.length) {
            series[0].markArea = {
                silent: true,
                label: {
                    show: false
                },
                data: [
                    [{ itemStyle: { color: 'rgba(16, 185, 129, 0.12)' }, xAxis: xMin, yAxis: medianTokens }, { xAxis: medianPrice, yAxis: yMax }],
                    [{ itemStyle: { color: 'rgba(59, 130, 246, 0.05)' }, xAxis: medianPrice, yAxis: medianTokens }, { xAxis: xMax, yAxis: yMax }],
                    [{ itemStyle: { color: 'rgba(59, 130, 246, 0.05)' }, xAxis: xMin, yAxis: 0 }, { xAxis: medianPrice, yAxis: medianTokens }],
                    [{ itemStyle: { color: 'rgba(239, 68, 68, 0.07)' }, xAxis: medianPrice, yAxis: 0 }, { xAxis: xMax, yAxis: medianTokens }]
                ]
            };
            series[0].markLine = {
                silent: true,
                symbol: 'none',
                lineStyle: {
                    color: 'rgba(23, 32, 51, 0.18)',
                    type: 'dashed'
                },
                label: {
                    show: false
                },
                data: [
                    { xAxis: medianPrice },
                    { yAxis: medianTokens }
                ]
            };
        }

        return {
            vendors: vendors,
            series: series,
            xMin: xMin,
            xMax: xMax,
            yMax: yMax,
            medianPrice: medianPrice,
            medianTokens: medianTokens
        };
    }

    function ensureCharts() {
        if (!window.echarts) {
            return;
        }
        if (!valueChart && valueChartEl) {
            valueChart = window.echarts.init(valueChartEl, null, { renderer: 'canvas' });
        }
        if (!costChart && costChartEl) {
            costChart = window.echarts.init(costChartEl, null, { renderer: 'canvas' });
        }
    }

    function renderValueChart(activeItems, colorMap) {
        if (!valueChartEl || !valueChart) {
            return;
        }
        var built = buildValueSeries(activeItems, colorMap);
        valueChartEl.hidden = false;
        valueChart.setOption({
            animationDuration: 420,
            animationDurationUpdate: 220,
            grid: {
                left: 86,
                right: 24,
                top: 56,
                bottom: 66
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(255, 252, 246, 0.96)',
                borderColor: 'rgba(23, 32, 51, 0.08)',
                borderWidth: 1,
                textStyle: {
                    color: '#172033'
                },
                formatter: function (params) {
                    var data = params.data || {};
                    return [
                        '<div style="min-width:220px">',
                        '<div style="font-size:14px;font-weight:800;margin-bottom:6px;">' + escapeHtmlSafe(data.vendor) + ' · ' + escapeHtmlSafe(data.plan) + '</div>',
                        '<div style="font-size:12px;line-height:1.7;">',
                        '<div><strong>月价：</strong>¥' + escapeHtmlSafe(formatPrice(data.monthlyPrice)) + '</div>',
                        '<div><strong>' + escapeHtmlSafe(getValueMetricTooltipLabel()) + '：</strong>' + escapeHtmlSafe(formatValueMetric(getValueMetricNumber(data[currentWindow] || {}))) + '</div>',
                        '<div><strong>' + escapeHtmlSafe(getWindowLabel(currentWindow)) + ' Token 上限：</strong>' + escapeHtmlSafe(formatCompactTokens(data[currentWindow].tokenLimit)) + '</div>',
                        '<div style="margin-top:6px;color:#5f6879;"><strong>数据参考：</strong>' + escapeHtmlSafe(data.seedSourceNote || '') + '</div>',
                        '</div>',
                        '</div>'
                    ].join('');
                }
            },
            xAxis: {
                type: 'category',
                data: built.vendors,
                boundaryGap: true,
                axisLabel: {
                    color: '#5f6879',
                    fontSize: 12,
                    fontWeight: 700,
                    interval: 0,
                    margin: 14
                },
                splitLine: {
                    show: true,
                    lineStyle: {
                        color: 'rgba(23, 32, 51, 0.08)'
                    }
                },
                axisTick: {
                    alignWithLabel: true
                },
                axisLine: {
                    lineStyle: {
                        color: 'rgba(23, 32, 51, 0.16)'
                    }
                }
            },
            yAxis: {
                type: 'value',
                name: getValueMetricYAxisName(),
                nameTextStyle: {
                    color: '#5f6879',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: [0, 0, 8, 0]
                },
                axisLabel: {
                    color: '#5f6879',
                    formatter: function (value) {
                        return formatValueMetric(value);
                    }
                },
                splitLine: {
                    lineStyle: {
                        color: 'rgba(23, 32, 51, 0.08)',
                        type: 'dashed'
                    }
                }
            },
            dataZoom: built.vendors.length > 6 ? [{
                type: 'slider',
                xAxisIndex: 0,
                height: 18,
                bottom: 20,
                brushSelect: false
            }] : [],
            series: [{
                name: getValueMetricSeriesName(),
                type: 'scatter',
                symbolSize: 16,
                label: {
                    show: true,
                    position: 'right',
                    distance: 8,
                    color: '#425065',
                    fontSize: 11,
                    fontWeight: 700,
                    formatter: function (params) {
                        var data = params.data || {};
                        if (!data.plan) {
                            return '';
                        }
                        return data.plan + '  ¥' + formatPrice(data.monthlyPrice);
                    }
                },
                data: built.points,
                emphasis: {
                    scale: 1.18
                }
            }]
        }, true);
        valueChart.resize();
    }

    function renderCostChart(activeItems, colorMap) {
        if (!costChartEl || !costChart) {
            return;
        }
        var built = buildCostSeries(activeItems, colorMap);
        costChartEl.hidden = false;
        costChart.setOption({
            animationDuration: 450,
            animationDurationUpdate: 240,
            color: built.vendors.map(function (vendor) {
                return colorMap[vendor];
            }),
            grid: {
                left: 86,
                right: 28,
                top: 78,
                bottom: 72
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(255, 252, 246, 0.96)',
                borderColor: 'rgba(23, 32, 51, 0.08)',
                borderWidth: 1,
                textStyle: {
                    color: '#172033'
                },
                formatter: function (params) {
                    var data = params.data || {};
                    var tokenLimitRows = [
                        '<div><strong>' + escapeHtmlSafe(getWindowLabel(currentWindow)) + ' Token 上限：</strong>' + escapeHtmlSafe(formatCompactTokens(data[currentWindow].tokenLimit)) + '</div>'
                    ];

                    if (currentWindow !== 'fiveHours') {
                        tokenLimitRows.push('<div><strong>5h Token 上限：</strong>' + escapeHtmlSafe(formatCompactTokens(data.fiveHours.tokenLimit)) + '</div>');
                    }

                    if (currentWindow !== 'weekly') {
                        tokenLimitRows.push('<div><strong>周 Token 上限：</strong>' + escapeHtmlSafe(formatCompactTokens(data.weekly.tokenLimit)) + '</div>');
                    }

                    if (currentWindow !== 'monthly') {
                        tokenLimitRows.push('<div><strong>月 Token 上限：</strong>' + escapeHtmlSafe(formatCompactTokens(data.monthly.tokenLimit)) + '</div>');
                    }

                    return [
                        '<div style="min-width:220px">',
                        '<div style="font-size:14px;font-weight:800;margin-bottom:6px;">' + escapeHtmlSafe(data.vendor) + ' · ' + escapeHtmlSafe(data.plan) + '</div>',
                        '<div style="font-size:12px;line-height:1.7;">',
                        '<div><strong>月价：</strong>¥' + escapeHtmlSafe(formatPrice(data.monthlyPrice)) + '</div>',
                        tokenLimitRows.join(''),
                        '<div style="margin-top:6px;color:#5f6879;"><strong>数据参考：</strong>' + escapeHtmlSafe(data.seedSourceNote || '') + '</div>',
                        '</div>',
                        '</div>'
                    ].join('');
                }
            },
            legend: {
                top: 10,
                left: 0,
                itemWidth: 10,
                itemHeight: 10,
                icon: 'circle',
                textStyle: {
                    color: '#5f6879',
                    fontSize: 12,
                    fontWeight: 600
                }
            },
            xAxis: {
                type: 'log',
                logBase: 2,
                min: built.xMin,
                max: built.xMax,
                name: '包月价格（元）',
                nameLocation: 'middle',
                nameGap: 42,
                nameTextStyle: {
                    color: '#5f6879',
                    fontSize: 12,
                    fontWeight: 700
                },
                splitNumber: 6,
                axisLabel: {
                    color: '#5f6879',
                    fontSize: 12,
                    fontWeight: 700,
                    formatter: function (value) {
                        return '¥' + formatPrice(value);
                    }
                },
                splitLine: {
                    show: true,
                    lineStyle: {
                        color: 'rgba(23, 32, 51, 0.08)',
                        type: 'dashed'
                    }
                },
                axisTick: {
                    show: false
                },
                axisLine: {
                    lineStyle: {
                        color: 'rgba(23, 32, 51, 0.16)'
                    }
                }
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: built.yMax,
                name: getWindowLabel(currentWindow) + ' Token 上限',
                nameTextStyle: {
                    color: '#5f6879',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: [0, 0, 8, 0]
                },
                axisLabel: {
                    color: '#5f6879',
                    formatter: function (value) {
                        return formatCompactTokens(value);
                    }
                },
                splitLine: {
                    lineStyle: {
                        color: 'rgba(23, 32, 51, 0.08)',
                        type: 'dashed'
                    }
                }
            },
            graphic: [{
                type: 'text',
                left: 160,
                top: 56,
                silent: true,
                style: {
                    text: '更便宜且用量更高',
                    fill: '#0f766e',
                    fontSize: 13,
                    fontWeight: 700
                }
            }],
            series: built.series
        }, true);
        costChart.resize();
    }

    function renderCharts() {
        if (!usagePayload) {
            return;
        }
        var activeItems = (usagePayload.items || []).filter(function (item) {
            return !item.discontinued;
        });
        if (!activeItems.length) {
            setState('当前没有可展示的套餐使用量数据。', false);
            if (valueChartEl) {
                valueChartEl.hidden = true;
            }
            if (costChartEl) {
                costChartEl.hidden = true;
            }
            return;
        }
        if (!window.echarts) {
            setState('图表组件加载失败，当前仅保留用量说明。', true);
            if (valueChartEl) {
                valueChartEl.hidden = true;
            }
            if (costChartEl) {
                costChartEl.hidden = true;
            }
            return;
        }

        ensureCharts();
        if (!valueChart || !costChart) {
            return;
        }
        if (stateEl) {
            stateEl.hidden = true;
        }
        var colorMap = buildVendorPalette(activeItems);
        setState('', false);
        renderValueChart(activeItems, colorMap);
        renderCostChart(activeItems, colorMap);
    }

    function applyPayload(payload) {
        usagePayload = payload;
        renderCharts();
    }

    function loadUsageData() {
        if (!panel) {
            return;
        }
        setState('', false);
        fetch(DERIVED_FILE_PATH)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (payload) {
                applyPayload(payload || {});
            })
            .catch(function (error) {
                console.warn('failed to load plan usage derived data', error);
                setState('套餐使用量数据加载失败，稍后可重新刷新页面查看。', true);
                if (valueChartEl) {
                    valueChartEl.hidden = true;
                }
                if (costChartEl) {
                    costChartEl.hidden = true;
                }
            });
    }

    windowButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            var nextWindow = button.getAttribute('data-usage-window');
            if (!nextWindow || nextWindow === currentWindow) {
                return;
            }
            setButtonState(nextWindow);
            renderCharts();
        });
    });

    valueMetricButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            var nextMetric = button.getAttribute('data-usage-value-metric');
            if (!nextMetric || nextMetric === currentValueMetric) {
                return;
            }
            setValueMetricState(nextMetric);
            renderCharts();
        });
    });

    setButtonState(currentWindow);
    setValueMetricState(currentValueMetric);
    window.addEventListener('resize', function () {
        if (valueChart) {
            valueChart.resize();
        }
        if (costChart) {
            costChart.resize();
        }
    });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadUsageData, { once: true });
    } else {
        loadUsageData();
    }
})();
