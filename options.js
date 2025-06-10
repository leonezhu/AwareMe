// AwareMe 设置页面脚本

class AwareMeOptions {
  constructor() {
    this.config = {
      visitReminders: [],
      durationLimits: [],
      weeklyLimits: []
    };
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
    } catch (error) {
      console.error('加载配置失败:', error);
      this.showMessage('加载配置失败', 'error');
    }
  }

  async saveConfig() {
    try {
      await chrome.storage.local.set({ userConfig: this.config });
      this.showMessage('配置保存成功', 'success');
    } catch (error) {
      console.error('保存配置失败:', error);
      this.showMessage('保存配置失败', 'error');
    }
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

    // 时长监控相关事件
    document.getElementById('addDurationRule').addEventListener('click', () => {
      this.addDurationRule();
    });
    document.getElementById('saveDurationConfig').addEventListener('click', () => {
      this.saveDurationConfig();
    });
    document.getElementById('resetDurationDefaults').addEventListener('click', () => {
      this.resetDurationDefaults();
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
    this.renderDurationTable();
    this.renderWeeklyTable();
  }

  renderVisitTable() {
    const tbody = document.getElementById('visitTableBody');
    tbody.innerHTML = '';

    this.config.visitReminders.forEach((rule, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
       <td>
          <textarea data-field="domains" data-index="${index}" rows="2" placeholder="域名列表（用逗号分隔）">${(rule.domains || []).join(', ')}</textarea>
        </td>
        <td>
          <input type="number" value="${rule.confirmTimes || 1}" data-field="confirmTimes" data-index="${index}" placeholder="确认次数" min="1" max="10">
        </td>
        <td>
          <textarea data-field="message" data-index="${index}" rows="2">${rule.message}</textarea>
        </td>
        <td>
          <button class="btn btn-danger btn-small delete-visit-rule" data-index="${index}">删除</button>
        </td>
      `;
      tbody.appendChild(row);

      // 绑定删除规则事件
      row.querySelector('.delete-visit-rule').addEventListener('click', () => {
        this.removeVisitRule(index);
      });
    });
  }

  addKeyword(ruleIndex, keyword) {
    if (!this.config.visitReminders[ruleIndex].keywords.includes(keyword)) {
      this.config.visitReminders[ruleIndex].keywords.push(keyword);
      this.renderVisitTable();
    }
  }

  renderDurationTable() {
    const tbody = document.getElementById('durationTableBody');
    tbody.innerHTML = '';

    this.config.durationLimits.forEach((rule, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <textarea data-field="domains" data-index="${index}" rows="2" placeholder="域名列表（用逗号分隔）">${(rule.domains || []).join(', ')}</textarea>
        </td>
        <td>
          <input type="number" value="${rule.confirmTimes || 1}" data-field="confirmTimes" data-index="${index}" placeholder="确认次数" min="1" max="10">
        </td>
        <td>
          <input type="number" value="${rule.minutes}" data-field="minutes" data-index="${index}" min="1">
        </td>
        <td>
          <textarea data-field="message" data-index="${index}" rows="2">${rule.message}</textarea>
        </td>
        <td>
          <button class="btn btn-danger btn-small delete-duration-rule" data-index="${index}">删除</button>
        </td>
      `;
      tbody.appendChild(row);

      // 绑定删除规则事件
      row.querySelector('.delete-duration-rule').addEventListener('click', () => {
        this.removeDurationRule(index);
      });
    });
  }

  renderWeeklyTable() {
    const tbody = document.getElementById('weeklyTableBody');
    tbody.innerHTML = '';

    this.config.weeklyLimits.forEach((rule, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <textarea data-field="domains" data-index="${index}" rows="2" placeholder="域名列表（用逗号分隔）">${(rule.domains || []).join(', ')}</textarea>
        </td>
        <td>
          <input type="number" value="${rule.confirmTimes || 1}" data-field="confirmTimes" data-index="${index}" placeholder="确认次数" min="1" max="10">
        </td>
        <td>
          <input type="number" value="${rule.maxVisits}" data-field="maxVisits" data-index="${index}" min="0">
        </td>
        <td>
          <textarea data-field="message" data-index="${index}" rows="2">${rule.message}</textarea>
        </td>
        <td>
          <button class="btn btn-danger btn-small delete-weekly-rule" data-index="${index}">删除</button>
        </td>
      `;
      tbody.appendChild(row);

      // 绑定删除规则事件
      row.querySelector('.delete-weekly-rule').addEventListener('click', () => {
        this.removeWeeklyRule(index);
      });
    });
  }

  addVisitRule() {
    this.config.visitReminders.push({
      confirmTimes: 1,
      domains: [],
      message: ''
    });
    this.renderVisitTable();
  }

  removeVisitRule(index) {
    this.config.visitReminders.splice(index, 1);
    this.renderVisitTable();
  }

  addDurationRule() {
    this.config.durationLimits.push({
      confirmTimes: 1,
      domains: [],
      minutes: 30,
      message: ''
    });
    this.renderDurationTable();
  }

  removeDurationRule(index) {
    this.config.durationLimits.splice(index, 1);
    this.renderDurationTable();
  }

  addWeeklyRule() {
    this.config.weeklyLimits.push({
      confirmTimes: 1,
      domains: [],
      maxVisits: 0,
      message: ''
    });
    this.renderWeeklyTable();
  }

  removeWeeklyRule(index) {
    this.config.weeklyLimits.splice(index, 1);
    this.renderWeeklyTable();
  }

  saveVisitConfig() {
    this.updateConfigFromTable();
    this.saveConfig();
  }

  saveDurationConfig() {
    this.updateConfigFromTable();
    this.saveConfig();
  }

  saveWeeklyConfig() {
    this.updateConfigFromTable();
    this.saveConfig();
  }

  updateConfigFromTable() {
    // 更新访问提醒配置
    const visitInputs = document.querySelectorAll('#visitTableBody input, #visitTableBody textarea');
    visitInputs.forEach(input => {
      const index = parseInt(input.dataset.index);
      const field = input.dataset.field;
      if (this.config.visitReminders[index]) {
        if (field === 'domains') {
          // 处理域名列表，将逗号分隔的字符串转换为数组
          this.config.visitReminders[index][field] = input.value.split(',').map(d => d.trim()).filter(d => d);
        } else {
          this.config.visitReminders[index][field] = input.value;
        }
      }
    });

    // 更新时长限制配置
    const durationInputs = document.querySelectorAll('#durationTableBody input, #durationTableBody textarea');
    durationInputs.forEach(input => {
      const index = parseInt(input.dataset.index);
      const field = input.dataset.field;
      if (this.config.durationLimits[index]) {
        if (field === 'domains') {
          // 处理域名列表，将逗号分隔的字符串转换为数组
          this.config.durationLimits[index][field] = input.value.split(',').map(d => d.trim()).filter(d => d);
        } else if (field === 'minutes') {
          this.config.durationLimits[index][field] = parseInt(input.value) || 1;
        } else {
          this.config.durationLimits[index][field] = input.value;
        }
      }
    });

    // 更新周访问限制配置
    const weeklyInputs = document.querySelectorAll('#weeklyTableBody input, #weeklyTableBody textarea');
    weeklyInputs.forEach(input => {
      const index = parseInt(input.dataset.index);
      const field = input.dataset.field;
      if (this.config.weeklyLimits[index]) {
        if (field === 'domains') {
          // 处理域名列表，将逗号分隔的字符串转换为数组
          this.config.weeklyLimits[index][field] = input.value.split(',').map(d => d.trim()).filter(d => d);
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
      await this.saveConfig();
      this.showMessage('已恢复默认配置', 'success');
    }
  }

  async resetDurationDefaults() {
    if (confirm('确定要恢复时长监控的默认配置吗？')) {
      const response = await fetch(chrome.runtime.getURL('data/default-config.json'));
      const defaultConfig = await response.json();
      this.config.durationLimits = defaultConfig.durationLimits;
      this.renderDurationTable();
      await this.saveConfig();
      this.showMessage('已恢复默认配置', 'success');
    }
  }

  async resetWeeklyDefaults() {
    if (confirm('确定要恢复频率限制的默认配置吗？')) {
      const response = await fetch(chrome.runtime.getURL('data/default-config.json'));
      const defaultConfig = await response.json();
      this.config.weeklyLimits = defaultConfig.weeklyLimits;
      this.renderWeeklyTable();
      await this.saveConfig();
      this.showMessage('已恢复默认配置', 'success');
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
    const durationData = {};
    const domains = new Set();
    
    // 处理所有数据
    for (const [key, value] of Object.entries(allStorageData)) {
      if (key.startsWith('visits_')) {
        visitData[key] = value;
        // 收集所有域名
        for (const domain of Object.keys(value)) {
          domains.add(domain);
        }
      } else if (key.startsWith('duration_')) {
        durationData[key] = value;
      }
    }
    
    // 获取今日访问数据
    const todayVisits = visitData[`visits_${today}`] || {};
    const todayDurations = durationData[`duration_${today}`] || {};
    
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
      
      // 获取当日访问时长
      const todayDuration = todayDurations[domain] || 0;
      const todayDurationMinutes = Math.round(todayDuration / (1000 * 60));
      
      // 使用工具类计算周访问天数
      const weeklyVisitDays = await AwareMeStats.getWeeklyVisitDays(domain);
      
      // 创建表格行
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${domain}</td>
        <td>${todayVisitCount}</td>
        <td>${todayDurationMinutes}</td>
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
    if (confirm('确定要清除所有统计数据吗？此操作不可恢复，但不会影响您的配置。')) {
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
});