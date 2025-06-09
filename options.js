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
      const result = await chrome.storage.local.get(['userConfig']);
      if (result.userConfig) {
        this.config = result.userConfig;
      } else {
        // 加载默认配置
        const response = await fetch(chrome.runtime.getURL('data/default-config.json'));
        this.config = await response.json();
      }
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
      const row = this.createVisitRow(rule, index);
      tbody.appendChild(row);
    });
  }

  createVisitRow(rule, index) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <input type="text" value="${rule.domain}" data-field="domain" data-index="${index}">
      </td>
      <td>
        <textarea data-field="message" data-index="${index}" rows="2">${rule.message}</textarea>
      </td>
      <td>
        <button class="btn btn-danger btn-small delete-visit-rule" data-index="${index}">删除</button>
      </td>
    `;

   

    // 绑定删除规则事件
    row.querySelector('.delete-visit-rule').addEventListener('click', () => {
      this.removeVisitRule(index);
    });

    return row;
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
          <input type="text" value="${rule.domain}" data-field="domain" data-index="${index}">
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
          <input type="text" value="${rule.domain}" data-field="domain" data-index="${index}">
        </td>
        <td>
          <input type="number" value="${rule.maxVisits}" data-field="maxVisits" data-index="${index}" min="1">
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
      domain: '',
      keywords: [],
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
      domain: '',
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
      domain: '',
      maxVisits: 5,
      message: ''
    });
    this.renderWeeklyTable();
  }

  removeWeeklyRule(index) {
    this.config.weeklyLimits.splice(index, 1);
    this.renderWeeklyTable();
  }

  saveVisitConfig() {
    this.updateConfigFromTable('visitTableBody', 'visitReminders');
    this.saveConfig();
  }

  saveDurationConfig() {
    this.updateConfigFromTable('durationTableBody', 'durationLimits');
    this.saveConfig();
  }

  saveWeeklyConfig() {
    this.updateConfigFromTable('weeklyTableBody', 'weeklyLimits');
    this.saveConfig();
  }

  updateConfigFromTable(tableBodyId, configKey) {
    const tbody = document.getElementById(tableBodyId);
    const inputs = tbody.querySelectorAll('input, textarea');
    
    inputs.forEach(input => {
      const index = parseInt(input.dataset.index);
      const field = input.dataset.field;
      
      if (this.config[configKey][index]) {
        if (field === 'minutes' || field === 'maxVisits') {
          this.config[configKey][index][field] = parseInt(input.value) || 1;
        } else {
          this.config[configKey][index][field] = input.value;
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
      // 获取总提醒次数
      let totalReminders = 0;
      const reminderKeys = await this.getKeysWithPrefix('reminders_');
      for (const key of reminderKeys) {
        const result = await chrome.storage.local.get([key]);
        totalReminders += result[key] || 0;
      }
      document.getElementById('totalReminders').textContent = totalReminders;

      // 获取今日访问网站数
      const today = new Date().toDateString();
      const todayVisitsResult = await chrome.storage.local.get([`visits_${today}`]);
      const todayVisits = todayVisitsResult[`visits_${today}`] || {};
      document.getElementById('todayVisits').textContent = Object.keys(todayVisits).length;

      // 获取本周访问网站数
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weeklyVisits = new Set();
      
      for (let d = new Date(weekAgo); d <= now; d.setDate(d.getDate() + 1)) {
        const dateKey = `visits_${d.toDateString()}`;
        const result = await chrome.storage.local.get([dateKey]);
        const visits = result[dateKey] || {};
        
        for (const domain of Object.keys(visits)) {
          weeklyVisits.add(domain);
        }
      }
      document.getElementById('weeklyVisits').textContent = weeklyVisits.size;

      // 获取日均浏览时长
      let totalDuration = 0;
      let dayCount = 0;
      const durationKeys = await this.getKeysWithPrefix('duration_');
      
      for (const key of durationKeys) {
        const result = await chrome.storage.local.get([key]);
        const durations = result[key] || {};
        
        let dayDuration = 0;
        for (const duration of Object.values(durations)) {
          dayDuration += duration;
        }
        
        if (dayDuration > 0) {
          totalDuration += dayDuration;
          dayCount++;
        }
      }
      
      const avgMinutes = dayCount > 0 ? Math.round(totalDuration / dayCount / (1000 * 60)) : 0;
      document.getElementById('avgDailyTime').textContent = avgMinutes;

    } catch (error) {
      console.error('加载统计数据失败:', error);
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
              key.startsWith('reminders_') ||
              key.startsWith('cooldown_')) {
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
    
    setTimeout(() => {
      messageEl.style.display = 'none';
    }, 3000);
  }
}

// 全局变量，用于在HTML中访问
const awareMeOptions = new AwareMeOptions();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化已在构造函数中完成
});