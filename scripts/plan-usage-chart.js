(function () {
    var DERIVED_FILE_PATH = './index-usage-derived.json';
    var panel = document.getElementById('planUsagePanel');
    var stateEl = document.getElementById('planUsageState');
    var valueChartEl = document.getElementById('planUsageValueChart');
    var costChartEl = document.getElementById('planUsageCostChart');
    var windowButtons = Array.prototype.slice.call(document.querySelectorAll('[data-usage-window]'));
    var currentWindow = 'fiveHours';
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

    function computeMedian(values) {
        if (!values.length) {
            return 0;
        }
        var sorted = values.slice().sort(function (left, right) {
            return left - right;
        });
        var middleIndex = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
        }
        return sorted[middleIndex];
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

    function buildValueSeries(items, colorMap) {
        var vendors = Array.from(new Set(items.map(function (item) {
            return item.vendor;
        })));
        return {
            vendors: vendors,
            points: items.map(function (item) {
                var windowMetrics = item.windows[currentWindow] || {};
                return {
                    value: [item.vendor, Number(windowMetrics.tokenPerCny || 0)],
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
            })
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
        var medianPrice = computeMedian(priceValues);
        var medianTokens = computeMedian(tokenValues);

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
                top: 28,
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
                        '<div><strong>' + escapeHtmlSafe(getWindowLabel(currentWindow)) + ' 每元 Token：</strong>' + escapeHtmlSafe(formatCompactTokens(data[currentWindow].tokenPerCny)) + '</div>',
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
            dataZoom: built.vendors.length > 6 ? [{
                type: 'slider',
                xAxisIndex: 0,
                height: 18,
                bottom: 20,
                brushSelect: false
            }] : [],
            series: [{
                name: '每元 Token',
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
                labelLayout: {
                    hideOverlap: true,
                    moveOverlap: 'shiftY'
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
                    return [
                        '<div style="min-width:220px">',
                        '<div style="font-size:14px;font-weight:800;margin-bottom:6px;">' + escapeHtmlSafe(data.vendor) + ' · ' + escapeHtmlSafe(data.plan) + '</div>',
                        '<div style="font-size:12px;line-height:1.7;">',
                        '<div><strong>月价：</strong>¥' + escapeHtmlSafe(formatPrice(data.monthlyPrice)) + '</div>',
                        '<div><strong>' + escapeHtmlSafe(getWindowLabel(currentWindow)) + ' Token 上限：</strong>' + escapeHtmlSafe(formatCompactTokens(data[currentWindow].tokenLimit)) + '</div>',
                        '<div><strong>5h Token 上限：</strong>' + escapeHtmlSafe(formatCompactTokens(data.fiveHours.tokenLimit)) + '</div>',
                        '<div><strong>周 Token 上限：</strong>' + escapeHtmlSafe(formatCompactTokens(data.weekly.tokenLimit)) + '</div>',
                        '<div><strong>月 Token 上限：</strong>' + escapeHtmlSafe(formatCompactTokens(data.monthly.tokenLimit)) + '</div>',
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
            labelLayout: {
                hideOverlap: true,
                moveOverlap: 'shiftY'
            },
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

    setButtonState(currentWindow);
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
