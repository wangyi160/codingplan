(function () {
    var DERIVED_FILE_PATH = './index-usage-derived.json';
    var panel = document.getElementById('planUsagePanel');
    var stateEl = document.getElementById('planUsageState');
    var chartEl = document.getElementById('planUsageChart');
    var generatedAtEl = document.getElementById('planUsageGeneratedAt');
    var coverageEl = document.getElementById('planUsageCoverage');
    var vendorCountEl = document.getElementById('planUsageVendorCount');
    var planCountEl = document.getElementById('planUsagePlanCount');
    var warningCountEl = document.getElementById('planUsageWarningCount');
    var windowButtons = Array.prototype.slice.call(document.querySelectorAll('[data-usage-window]'));
    var currentWindow = 'fiveHours';
    var chart = null;
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

    function buildVendorSeries(items) {
        var grouped = new Map();
        items.forEach(function (item) {
            if (!grouped.has(item.vendor)) {
                grouped.set(item.vendor, []);
            }
            grouped.get(item.vendor).push(item);
        });

        var vendors = Array.from(grouped.keys());
        var palette = ['#0f766e', '#c66b1a', '#1d4ed8', '#be123c', '#7c3aed', '#0369a1', '#b45309', '#047857'];
        var priceValues = [];
        var tokenValues = [];
        var series = vendors.map(function (vendor, vendorIndex) {
            var color = palette[vendorIndex % palette.length];
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
                        color: color,
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
                symbolSize: 16,
                data: points,
                emphasis: {
                    scale: 1.18
                }
            };
        });

        var xMin = priceValues.length ? Math.max(0, Math.floor(Math.min.apply(null, priceValues) * 0.75)) : 0;
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
                    [{ itemStyle: { color: 'rgba(245, 158, 11, 0.05)' }, xAxis: xMin, yAxis: 0 }, { xAxis: medianPrice, yAxis: medianTokens }],
                    [{ itemStyle: { color: 'rgba(23, 32, 51, 0.05)' }, xAxis: medianPrice, yAxis: 0 }, { xAxis: xMax, yAxis: medianTokens }]
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

    function renderChart() {
        if (!usagePayload || !chartEl) {
            return;
        }
        var activeItems = (usagePayload.items || []).filter(function (item) {
            return !item.discontinued;
        });
        if (!activeItems.length) {
            setState('当前没有可展示的套餐使用量数据。', false);
            chartEl.hidden = true;
            return;
        }
        if (!window.echarts) {
            setState('图表组件加载失败，当前仅保留用量说明。', true);
            chartEl.hidden = true;
            return;
        }

        var built = buildVendorSeries(activeItems);
        chartEl.hidden = false;
        if (stateEl) {
            stateEl.hidden = true;
        }

        if (!chart) {
            chart = window.echarts.init(chartEl, null, { renderer: 'canvas' });
            window.addEventListener('resize', function () {
                if (chart) {
                    chart.resize();
                }
            });
        }

        chart.setOption({
            animationDuration: 450,
            animationDurationUpdate: 240,
            grid: {
                left: 86,
                right: 28,
                top: 64,
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
                        '<div style="margin-top:6px;color:#5f6879;"><strong>基准样本：</strong>' + escapeHtmlSafe(data.seedPlan) + '</div>',
                        '<div style="color:#5f6879;">' + escapeHtmlSafe(data.seedSourceNote || '') + '</div>',
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
                type: 'value',
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
                left: 110,
                top: 34,
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

        chart.resize();
    }

    function applyPayload(payload) {
        usagePayload = payload;
        var activeItems = (payload.items || []).filter(function (item) {
            return !item.discontinued;
        });
        var vendorNames = Array.from(new Set(activeItems.map(function (item) {
            return item.vendor;
        })));

        if (generatedAtEl) {
            generatedAtEl.textContent = formatDate(payload.generatedAt);
        }
        if (vendorCountEl) {
            vendorCountEl.textContent = String(vendorNames.length);
        }
        if (planCountEl) {
            planCountEl.textContent = String(activeItems.length);
        }
        if (warningCountEl) {
            warningCountEl.textContent = String((payload.warnings || []).length);
        }
        if (coverageEl) {
            coverageEl.innerHTML = '<strong>当前覆盖：</strong>' + escapeHtmlSafe(vendorNames.join(' / ')) + '。未配置样本的平台暂不展示。';
        }

        renderChart();
    }

    function loadUsageData() {
        if (!panel) {
            return;
        }
        setState('正在加载套餐使用量对比…', false);
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
                if (chartEl) {
                    chartEl.hidden = true;
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
            renderChart();
        });
    });

    setButtonState(currentWindow);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadUsageData, { once: true });
    } else {
        loadUsageData();
    }
})();
