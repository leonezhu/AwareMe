// AwareMe 设置页面脚本

class AwareMeOptions {
  constructor() {
    this.config = {
      visitReminders: [],
      weeklyLimits: []
    };
    // 勾选了严格模式但尚未通过"保存 + 二次确认"生效的规则（存规则对象引用）
    this.pendingStrict = {
      visitReminders: new Set(),
      weeklyLimits: new Set()
    };
    // 每条规则最近一次保存时的数据快照，用于开启严格模式时校验未同时放宽
    this.ruleSnapshots = new Map();
    this.init();
  }

  async init() {
    await this.loadConfig();
    this.bindEvents();
    this.renderAllTables();
    await this.loadStats();
  }

  async loadConfig() {
    try {
      this.config = await AwareMeUtils.loadConfig();
      this.snapshotRules();
    } catch (error) {
      console.error('加载配置失败:', error);
      this.showMessage('加载配置失败', 'error');
    }
  }

  /**
   * 记录每条规则最近一次保存时的数据，用于开启严格模式时校验"开启的同时没有放宽"
   */
  snapshotRules() {
    this.ruleSnapshots.clear();
    for (const listName of ['visitReminders', 'weeklyLimits']) {
      for (const rule of this.config[listName] || []) {
        this.ruleSnapshots.set(rule, {
          domains: [...(rule.domains || [])],
          confirmTimes: Number(rule.confirmTimes) || 1,
          maxVisits: listName === 'weeklyLimits' ? (Number(rule.maxVisits) || 0) : 0
        });
      }
    }
  }

  async saveConfig() {
    try {
      // 强制严格模式规则的 status 和 strict 不可更改
      for (const rule of this.config.visitReminders) {
        if (rule.strict) { rule.status = true; rule.strict = true; }
      }
      for (const rule of this.config.weeklyLimits) {
        if (rule.strict) { rule.status = true; rule.strict = true; }
      }

      // 与最近一次保存的配置对比，防止严格模式规则被削弱后写入
      const savedConfig = await this.getSavedConfig();
      const violations = this.findStrictViolations(this.config, savedConfig);
      if (violations.length > 0) {
        // 拒绝保存，并回滚到最近一次保存的合法配置
        if (savedConfig) {
          this.config = savedConfig;
          this.renderAllTables();
        }
        this.showMessage(`🔒 严格模式保护：${violations.join('；')}`, 'error');
        return false;
      }

      await chrome.storage.local.set({ userConfig: this.config });
      this.snapshotRules();
      this.showMessage('配置保存成功', 'success');
      return true;
    } catch (error) {
      console.error('保存配置失败:', error);
      this.showMessage('保存配置失败', 'error');
      return false;
    }
  }

  /**
   * 读取最近一次保存到 storage 的配置，作为严格模式校验基线
   */
  async getSavedConfig() {
    try {
      const result = await chrome.storage.local.get(['userConfig']);
      return result.userConfig || null;
    } catch (error) {
      console.error('读取已保存配置失败:', error);
      return null;
    }
  }

  /**
   * 校验严格模式规则未被削弱
   * 规则：已有域名不能修改删除（只能新增）；每周可访问天数不能增大；确认次数只能增加不能减少
   * @param {Object} newConfig - 待保存的配置
   * @param {Object|null} savedConfig - 最近一次保存的配置
   * @returns {Array<string>} 违规提示列表，为空表示通过
   */
  findStrictViolations(newConfig, savedConfig) {
    const violations = [];
    if (!savedConfig) return violations;

    const checkCategory = (listName, label) => {
      const oldRules = (savedConfig[listName] || []).filter(r => r && r.strict === true);
      if (oldRules.length === 0) return;
      const newStrictRules = (newConfig[listName] || []).filter(r => r && r.strict === true);

      for (const oldRule of oldRules) {
        const oldDomains = oldRule.domains || [];
        if (oldDomains.length === 0) continue;
        const ruleLabel = `严格${label}规则「${oldDomains.join('、')}」`;

        // 按域名重合度找到对应的新规则（兼容规则增删和位置变化）
        let matched = null;
        let bestOverlap = 0;
        for (const newRule of newStrictRules) {
          const newDomainSet = new Set(newRule.domains || []);
          const overlap = oldDomains.filter(d => newDomainSet.has(d)).length;
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            matched = newRule;
          }
        }

        if (!matched) {
          violations.push(`${ruleLabel}被删除`);
          continue;
        }

        // 已有域名不能移除（移到其他严格规则里也算移除）
        const newDomainSet = new Set(matched.domains || []);
        const removedDomains = oldDomains.filter(d => !newDomainSet.has(d));
        if (removedDomains.length > 0) {
          violations.push(`${ruleLabel}不能删除已有域名（${removedDomains.join('、')}）`);
        }

        // 确认次数只能增加不能减少
        const oldTimes = Number(oldRule.confirmTimes) || 1;
        const newTimes = Number(matched.confirmTimes) || 1;
        if (newTimes < oldTimes) {
          violations.push(`${ruleLabel}确认次数不能减少（${oldTimes} → ${newTimes}）`);
        }

        // 每周可访问天数不能增大
        if (listName === 'weeklyLimits') {
          const oldMax = Number(oldRule.maxVisits) || 0;
          const newMax = Number(matched.maxVisits) || 0;
          if (newMax > oldMax) {
            violations.push(`${ruleLabel}每周可访问天数不能增大（${oldMax} → ${newMax}）`);
          }
        }
      }
    };

    checkCategory('visitReminders', '访问提醒');
    checkCategory('weeklyLimits', '周访问限制');
    return violations;
  }

  bindEvents() {
    // 标签页切换
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // 访问提醒相关事件
    document.getElementById('addVisitRule').addEventListener('click', () => {
      this.addVisitRule();
    });
    document.getElementById('saveVisitConfig').addEventListener('click', () => {
      this.saveVisitConfig();
    });
    document.getElementById('resetVisitDefaults').addEventListener('click', () => {
      this.resetVisitDefaults();
    });

    // 频率限制相关事件
    document.getElementById('addWeeklyRule').addEventListener('click', () => {
      this.addWeeklyRule();
    });
    document.getElementById('saveWeeklyConfig').addEventListener('click', () => {
      this.saveWeeklyConfig();
    });
    document.getElementById('resetWeeklyDefaults').addEventListener('click', () => {
      this.resetWeeklyDefaults();
    });

 
    document.getElementById('clearAllData').addEventListener('click', () => {
      this.clearAllData();
    });
  }

  switchTab(tabName) {
    // 更新标签页状态
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // 更新面板显示
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    document.getElementById(`${tabName}-panel`).classList.add('active');

    // 如果切换到统计页面，重新加载统计数据
    if (tabName === 'stats') {
      this.loadStats();
    }
  }

  renderAllTables() {
    this.renderVisitTable();
    this.renderWeeklyTable();
  }

  renderVisitTable() {
    const tbody = document.getElementById('visitTableBody');
    tbody.innerHTML = '';

    this.config.visitReminders.forEach((rule, index) => {
      const row = document.createElement('tr');
      const isEnabled = rule.status !== false; // 默认启用
      const isStrict = rule.strict === true;
      const isPending = !isStrict && this.pendingStrict.visitReminders.has(rule);

      // 严格模式下：checkbox 不可取消，隐藏关闭和删除按钮
      const strictCheckbox = isStrict
        ? `<input type="checkbox" checked disabled title="严格模式已锁定">`
        : `<input type="checkbox" ${isPending ? 'checked' : ''} data-field="strict" data-index="${index}" title="勾选后需点击保存并二次确认后才生效">`;

      const strictHint = isStrict ? 'title="严格模式：只能调大，保存时不能调小"' : '';

      const actionButtons = isStrict
        ? `<span class="locked-badge">🔒 已锁定</span>`
        : `${isPending ? '<span class="pending-badge">⏳ 待保存确认</span>' : ''}<button class="btn ${isEnabled ? 'btn-secondary' : 'btn-primary'} btn-small toggle-visit-status" data-index="${index}">
            ${isEnabled ? '关闭' : '启用'}
          </button>
          <button class="btn btn-danger btn-small delete-visit-rule" data-index="${index}">删除</button>`;

      row.innerHTML = `
       <td>
          <textarea data-field="domains" data-index="${index}" rows="2" placeholder="每行一个域名或关键词" ${strictHint}>${(rule.domains || []).join('\n')}</textarea>
        </td>
        <td>
          <input type="number" value="${rule.confirmTimes || 1}" data-field="confirmTimes" data-index="${index}" placeholder="确认次数" min="1" max="10" ${strictHint}>
        </td>
        <td>
          <textarea data-field="message" data-index="${index}" rows="2">${rule.message}</textarea>
        </td>
        <td class="strict-cell">
          ${strictCheckbox}
        </td>
        <td>
          ${actionButtons}
        </td>
      `;
      tbody.appendChild(row);

      if (!isStrict) {
        // 绑定状态切换事件
        row.querySelector('.toggle-visit-status').addEventListener('click', () => {
          this.toggleVisitRuleStatus(index);
        });

        // 绑定删除规则事件
        row.querySelector('.delete-visit-rule').addEventListener('click', () => {
          this.removeVisitRule(index);
        });
      }

      // 绑定严格模式 checkbox 事件（仅非严格模式下可点击）
      // 勾选只标记"待确认"，不直接生效；点击保存并二次确认后才开启
      const strictCheckboxEl = row.querySelector('.strict-cell input[type="checkbox"]:not([disabled])');
      if (strictCheckboxEl) {
        strictCheckboxEl.addEventListener('change', () => {
          const rule = this.config.visitReminders[index];
          if (strictCheckboxEl.checked) {
            this.pendingStrict.visitReminders.add(rule);
            this.showMessage('已勾选严格模式，点击"保存"按钮并二次确认后生效', 'success');
          } else {
            this.pendingStrict.visitReminders.delete(rule);
          }
          this.renderVisitTable();
        });
      }
    });
  }

  addKeyword(ruleIndex, keyword) {
    if (!this.config.visitReminders[ruleIndex].keywords.includes(keyword)) {
      this.config.visitReminders[ruleIndex].keywords.push(keyword);
      this.renderVisitTable();
    }
  }

  renderWeeklyTable() {
    const tbody = document.getElementById('weeklyTableBody');
    tbody.innerHTML = '';

    this.config.weeklyLimits.forEach((rule, index) => {
      const row = document.createElement('tr');
      const isEnabled = rule.status !== false; // 默认启用
      const isStrict = rule.strict === true;
      const isPending = !isStrict && this.pendingStrict.weeklyLimits.has(rule);

      const strictCheckbox = isStrict
        ? `<input type="checkbox" checked disabled title="严格模式已锁定">`
        : `<input type="checkbox" ${isPending ? 'checked' : ''} data-field="strict" data-index="${index}" title="勾选后需点击保存并二次确认后才生效">`;

      const strictHint = isStrict ? 'title="严格模式：域名只能新增；确认次数只能调大；每周可访问天数只能调小"' : '';

      const actionButtons = isStrict
        ? `<span class="locked-badge">🔒 已锁定</span>`
        : `${isPending ? '<span class="pending-badge">⏳ 待保存确认</span>' : ''}<button class="btn ${isEnabled ? 'btn-secondary' : 'btn-primary'} btn-small toggle-weekly-status" data-index="${index}">
            ${isEnabled ? '关闭' : '启用'}
          </button>
          <button class="btn btn-danger btn-small delete-weekly-rule" data-index="${index}">删除</button>`;

      row.innerHTML = `
        <td>
          <textarea data-field="domains" data-index="${index}" rows="2" placeholder="每行一个域名或关键词" ${strictHint}>${(rule.domains || []).join('\n')}</textarea>
        </td>
        <td>
          <input type="number" value="${rule.confirmTimes || 1}" data-field="confirmTimes" data-index="${index}" placeholder="确认次数" min="1" max="10" ${strictHint}>
        </td>
        <td>
          <input type="number" value="${rule.maxVisits}" data-field="maxVisits" data-index="${index}" min="0" ${strictHint}>
        </td>
        <td>
          <textarea data-field="message" data-index="${index}" rows="2">${rule.message}</textarea>
        </td>
        <td class="strict-cell">
          ${strictCheckbox}
        </td>
        <td>
          ${actionButtons}
        </td>
      `;
      tbody.appendChild(row);

      if (!isStrict) {
        // 绑定状态切换事件
        row.querySelector('.toggle-weekly-status').addEventListener('click', () => {
          this.toggleWeeklyRuleStatus(index);
        });

        // 绑定删除规则事件
        row.querySelector('.delete-weekly-rule').addEventListener('click', () => {
          this.removeWeeklyRule(index);
        });
      }

      // 绑定严格模式 checkbox 事件
      // 勾选只标记"待确认"，不直接生效；点击保存并二次确认后才开启
      const strictCheckboxEl = row.querySelector('.strict-cell input[type="checkbox"]:not([disabled])');
      if (strictCheckboxEl) {
        strictCheckboxEl.addEventListener('change', () => {
          const rule = this.config.weeklyLimits[index];
          if (strictCheckboxEl.checked) {
            this.pendingStrict.weeklyLimits.add(rule);
            this.showMessage('已勾选严格模式，点击"保存"按钮并二次确认后生效', 'success');
          } else {
            this.pendingStrict.weeklyLimits.delete(rule);
          }
          this.renderWeeklyTable();
        });
      }
    });
  }

  addVisitRule() {
    this.config.visitReminders.push({
      confirmTimes: 1,
      domains: [],
      message: '',
      status: true
    });
    this.renderVisitTable();
  }

  removeVisitRule(index) {
    if (this.config.visitReminders[index] && this.config.visitReminders[index].strict) {
      this.showMessage('严格模式下不能删除此规则', 'error');
      return;
    }
    this.config.visitReminders.splice(index, 1);
    this.renderVisitTable();
  }

  addWeeklyRule() {
    this.config.weeklyLimits.push({
      confirmTimes: 1,
      domains: [],
      maxVisits: 0,
      message: '',
      status: true
    });
    this.renderWeeklyTable();
  }

  removeWeeklyRule(index) {
    if (this.config.weeklyLimits[index] && this.config.weeklyLimits[index].strict) {
      this.showMessage('严格模式下不能删除此规则', 'error');
      return;
    }
    this.config.weeklyLimits.splice(index, 1);
    this.renderWeeklyTable();
  }

  toggleVisitRuleStatus(index) {
    if (this.config.visitReminders[index]) {
      if (this.config.visitReminders[index].strict) {
        this.showMessage('严格模式下不能关闭此规则', 'error');
        this.renderVisitTable();
        return;
      }
      this.config.visitReminders[index].status = !this.config.visitReminders[index].status;
      this.renderVisitTable();
      this.saveConfig();
    }
  }

  toggleWeeklyRuleStatus(index) {
    if (this.config.weeklyLimits[index]) {
      if (this.config.weeklyLimits[index].strict) {
        this.showMessage('严格模式下不能关闭此规则', 'error');
        this.renderWeeklyTable();
        return;
      }
      this.config.weeklyLimits[index].status = !this.config.weeklyLimits[index].status;
      this.renderWeeklyTable();
      this.saveConfig();
    }
  }

  async saveVisitConfig() {
    this.updateConfigFromTable();
    if (!this.applyPendingStrict('visitReminders')) return;
    await this.saveConfig();
    this.renderVisitTable();
  }

  async saveWeeklyConfig() {
    this.updateConfigFromTable();
    if (!this.applyPendingStrict('weeklyLimits')) return;
    await this.saveConfig();
    this.renderWeeklyTable();
  }

  /**
   * 处理本次保存中勾选的严格模式：
   * 1. 校验行数据完整（验全）；2. 校验开启的同时没有比已保存状态放宽；
   * 3. 二次确认后才真正开启。取消确认则本次不开启，其余修改仍会保存
   * @param {string} listName - 'visitReminders' | 'weeklyLimits'
   * @returns {boolean} 是否继续执行保存
   */
  applyPendingStrict(listName) {
    const pendingRules = this.pendingStrict[listName];
    if (pendingRules.size === 0) return true;

    const list = this.config[listName];
    const label = listName === 'visitReminders' ? '访问提醒' : '周访问限制';

    // 清理已删除行的残留引用
    for (const rule of [...pendingRules]) {
      if (!list.includes(rule)) pendingRules.delete(rule);
    }
    if (pendingRules.size === 0) return true;

    // 1. 行数据验全
    for (const rule of pendingRules) {
      const errors = this.validateRuleData(listName, rule);
      if (errors.length > 0) {
        this.showMessage(`开启严格模式前需先完善该行数据：${errors.join('；')}`, 'error');
        return false;
      }
    }

    // 2. 开启严格模式只能收紧不能放宽，防止"放宽后立刻锁死"
    for (const rule of pendingRules) {
      const snapshot = this.ruleSnapshots.get(rule);
      if (!snapshot) continue; // 本次新增的规则没有已保存状态
      const weakenErrors = [];
      const newDomainSet = new Set(rule.domains || []);
      const removed = snapshot.domains.filter(d => !newDomainSet.has(d));
      if (removed.length > 0) {
        weakenErrors.push(`不能删除已有域名（${removed.join('、')}）`);
      }
      const oldTimes = snapshot.confirmTimes;
      const newTimes = Number(rule.confirmTimes) || 1;
      if (newTimes < oldTimes) {
        weakenErrors.push(`确认次数不能减少（${oldTimes} → ${newTimes}）`);
      }
      if (listName === 'weeklyLimits') {
        const oldMax = snapshot.maxVisits;
        const newMax = Number(rule.maxVisits) || 0;
        if (newMax > oldMax) {
          weakenErrors.push(`每周可访问天数不能增大（${oldMax} → ${newMax}）`);
        }
      }
      if (weakenErrors.length > 0) {
        this.showMessage(`开启严格模式时不能同时放宽规则：${weakenErrors.join('；')}。请先单独保存收紧后的配置，再开启严格模式`, 'error');
        return false;
      }
    }

    // 3. 二次确认
    const extra = listName === 'weeklyLimits' ? '、每周可访问天数只能调小' : '';
    const confirmed = confirm(
      `确认开启严格模式？开启后将立即保存并锁定选中的 ${pendingRules.size} 条${label}规则：` +
      `不可关闭、不可删除，域名只能新增，确认次数只能调大${extra}。`
    );
    if (!confirmed) {
      for (const rule of pendingRules) { rule.strict = false; }
      pendingRules.clear();
      return true;
    }

    // 4. 开启（saveConfig 会写入 storage 并刷新快照）
    for (const rule of pendingRules) {
      rule.strict = true;
      rule.status = true;
    }
    pendingRules.clear();
    return true;
  }

  /**
   * 校验单条规则数据完整性（开启严格模式前调用）
   * @param {string} listName - 'visitReminders' | 'weeklyLimits'
   * @param {Object} rule - 规则
   * @returns {Array<string>} 错误列表，为空表示通过
   */
  validateRuleData(listName, rule) {
    const errors = [];
    if (!rule.domains || rule.domains.length === 0) {
      errors.push('至少填写一个域名');
    }
    const times = Number(rule.confirmTimes);
    if (!Number.isInteger(times) || times < 1 || times > 10) {
      errors.push('确认次数需为1-10的整数');
    }
    if (listName === 'weeklyLimits') {
      const maxVisits = Number(rule.maxVisits);
      if (!Number.isInteger(maxVisits) || maxVisits < 0) {
        errors.push('每周可访问天数需为不小于0的整数');
      }
    }
    if (!rule.message || !String(rule.message).trim()) {
      errors.push('提醒消息不能为空');
    }
    return errors;
  }

  updateConfigFromTable() {
    // 更新访问提醒配置
    const visitInputs = document.querySelectorAll('#visitTableBody input, #visitTableBody textarea');
    visitInputs.forEach(input => {
      const index = parseInt(input.dataset.index);
      const field = input.dataset.field;
      if (this.config.visitReminders[index]) {
        // strict 勾选由"保存时验全 + 二次确认"流程管理，这里跳过
        if (field === 'strict') return;
        if (input.type === 'checkbox') {
          // checkbox 必须读 checked 而非 value（value 永远是 "on"）
          this.config.visitReminders[index][field] = input.checked;
        } else if (field === 'domains') {
          // 处理域名列表，将换行分隔的字符串转换为数组
          this.config.visitReminders[index][field] = input.value.split(/[\n,]/).map(d => d.trim()).filter(d => d);
        } else {
          this.config.visitReminders[index][field] = input.value;
        }
      }
    });

    // 更新周访问限制配置
    const weeklyInputs = document.querySelectorAll('#weeklyTableBody input, #weeklyTableBody textarea');
    weeklyInputs.forEach(input => {
      const index = parseInt(input.dataset.index);
      const field = input.dataset.field;
      if (this.config.weeklyLimits[index]) {
        // strict 勾选由"保存时验全 + 二次确认"流程管理，这里跳过
        if (field === 'strict') return;
        if (input.type === 'checkbox') {
          this.config.weeklyLimits[index][field] = input.checked;
        } else if (field === 'domains') {
          // 处理域名列表，将换行分隔的字符串转换为数组
          this.config.weeklyLimits[index][field] = input.value.split(/[\n,]/).map(d => d.trim()).filter(d => d);
        } else if (field === 'maxVisits') {
          this.config.weeklyLimits[index][field] = parseInt(input.value) || 0;
        } else {
          this.config.weeklyLimits[index][field] = input.value;
        }
      }
    });
  }

  async resetVisitDefaults() {
    if (confirm('确定要恢复访问提醒的默认配置吗？')) {
      const response = await fetch(chrome.runtime.getURL('data/default-config.json'));
      const defaultConfig = await response.json();
      this.config.visitReminders = defaultConfig.visitReminders;
      this.renderVisitTable();
      const saved = await this.saveConfig();
      // 严格模式校验失败时 saveConfig 内部已回滚并提示错误，不再覆盖提示成功
      if (saved) {
        this.showMessage('已恢复默认配置', 'success');
      }
    }
  }

  async resetWeeklyDefaults() {
    if (confirm('确定要恢复周访问限制的默认配置吗？')) {
      const response = await fetch(chrome.runtime.getURL('data/default-config.json'));
      const defaultConfig = await response.json();
      this.config.weeklyLimits = defaultConfig.weeklyLimits;
      this.renderWeeklyTable();
      const saved = await this.saveConfig();
      if (saved) {
        this.showMessage('已恢复默认配置', 'success');
      }
    }
  }

  async loadStats() {
    try {
      // 生成网站详细统计表格
      await this.renderWebsiteStatsTable();
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  }

  async renderWebsiteStatsTable() {
    const tbody = document.getElementById('websiteStatsTableBody');
    tbody.innerHTML = '';

    // 获取当前日期和一周前的日期
    const now = new Date();
    const today = now.toDateString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // 一次性获取所有存储数据
    const allStorageData = await chrome.storage.local.get(null);
    
    // 分类存储数据
    const visitData = {};
    const domains = new Set();
    
    // 处理所有数据
    for (const [key, value] of Object.entries(allStorageData)) {
      if (key.startsWith('visits_')) {
        visitData[key] = value;
        // 收集所有域名
        for (const domain of Object.keys(value)) {
          domains.add(domain);
        }
      }
    }
    
    // 获取今日访问数据
    const todayVisits = visitData[`visits_${today}`] || {};
    
    // 按今日访问次数降序排序域名
    const domainStats = [];
    for (const domain of domains) {
      // 获取今日访问次数（用于排序）
      const todayVisitCount = todayVisits[domain] || 0;
      
      domainStats.push({ domain, todayVisitCount });
    }
    
    // 按今日访问次数降序排序
    domainStats.sort((a, b) => b.todayVisitCount - a.todayVisitCount);
    
    // 为每个域名计算统计数据并生成表格行
    for (const { domain } of domainStats) {
      // 获取当日访问次数
      const todayVisitCount = todayVisits[domain] || 0;
      
      // 使用工具类计算周访问天数
      const weeklyVisitDays = await AwareMeStats.getWeeklyVisitDays(domain);
      
      // 创建表格行
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${domain}</td>
        <td>${todayVisitCount}</td>
        <td>${weeklyVisitDays}</td>
      `;
      tbody.appendChild(row);
    }
  }

  async getKeysWithPrefix(prefix) {
    const result = await chrome.storage.local.get(null);
    return Object.keys(result).filter(key => key.startsWith(prefix));
  }

  

  async clearAllData() {
    if (confirm('确定要清除所有统计数据吗？此操作不可恢复，但不会影响您的配置')) {
      try {
        // 获取所有存储的键
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = [];
        
        for (const key of Object.keys(allData)) {
          if (key.startsWith('visits_') || 
              key.startsWith('duration_') || 
              key.startsWith('reminders_')) {
            keysToRemove.push(key);
          }
        }
        
        if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
          this.showMessage('所有统计数据已清除', 'success');
          this.loadStats(); // 重新加载统计数据
        } else {
          this.showMessage('没有找到需要清除的数据', 'success');
        }
      } catch (error) {
        console.error('清除数据失败:', error);
        this.showMessage('清除数据失败', 'error');
      }
    }
  }

  showMessage(text, type = 'success') {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    // 使用requestAnimationFrame确保元素已渲染后再添加show类
    requestAnimationFrame(() => {
      messageEl.classList.add('show');
    });
    
    setTimeout(() => {
      messageEl.classList.remove('show');
      // 等待动画完成后隐藏元素
      setTimeout(() => {
        messageEl.style.display = 'none';
      }, 300); // 与CSS transition时间一致
    }, 3000);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  const awareMeOptions = new AwareMeOptions();
}, { passive: true });