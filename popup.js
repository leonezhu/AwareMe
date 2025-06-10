// AwareMe 弹出窗口脚本

class AwareMePopup {
  constructor() {
    this.isEnabled = true; // 默认启用状态
    this.init();
  }

  async init() {
    await this.loadExtensionStatus();
    await this.loadCurrentSite();
    this.bindEvents();
    this.updateToggleButton();
  }

  async loadExtensionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getExtensionStatus' });
      this.isEnabled = response.isEnabled;
      console.log('获取插件状态:', this.isEnabled);
    } catch (error) {
      console.error('获取插件状态失败:', error);
    }
  }



  async loadCurrentSite() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('当前标签页:', tabs);
      if (tabs[0] && tabs[0].url) {
        const domain = this.extractDomain(tabs[0].url);
        console.log('提取的域名:', domain);
        if (domain && !domain.startsWith('chrome')) {
          document.getElementById('currentSite').style.display = 'block';
          document.getElementById('currentDomain').textContent = domain;

          // 获取今日在该网站的访问次数
          const todayVisits = await this.getTodayVisits(domain);
          console.log('今日访问次数:', todayVisits);
          document.getElementById('todayVisits').textContent = todayVisits;

          // 获取今日在该网站的浏览时长
          const todayDuration = await this.getTodayDuration(domain);
          const minutes = Math.round(todayDuration / (1000 * 60));
          console.log('今日浏览时长:', todayDuration, '分钟:', minutes);
          document.getElementById('todayDuration').textContent = `${minutes} min`;

          // 获取本周在该网站的访问天数
          const weeklyVisits = await this.getWeeklyVisits(domain);
          console.log('本周访问天数:', weeklyVisits);
          document.getElementById('weeklyVisits').textContent = weeklyVisits;
        } else {
          console.log('域名无效或为chrome页面，不显示统计');
        }
      } else {
        console.log('没有找到有效的标签页');
      }
    } catch (error) {
      console.error('加载当前网站信息失败:', error);
    }
  }

  async getTodayVisits(domain) {
    const today = new Date().toDateString();
    const visitKey = `visits_${today}`;
    
    const result = await chrome.storage.local.get([visitKey]);
    const visits = result[visitKey] || {};
    return visits[domain] || 0;
  }

  async getWeeklyVisits(domain) {
    console.log('计算本周访问天数，域名:', domain);
    
    // 获取当前日期所在周的周一和周日
    const now = new Date();
    const currentDay = now.getDay(); // 0是周日，1-6是周一到周六
    
    // 计算本周的周一日期（如果今天是周日，则取上周一）
    const monday = new Date(now);
    monday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    monday.setHours(0, 0, 0, 0);
    
    // 计算本周的周日日期（如果今天是周日，则取今天）
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + (currentDay === 0 ? 0 : 7 - currentDay));
    sunday.setHours(23, 59, 59, 999);
    
    let visitedDays = 0;

    // 从周一到周日遍历每一天
    for (let d = new Date(monday); d <= sunday; d.setDate(d.getDate() + 1)) {
      const dateKey = `visits_${d.toDateString()}`;
      const result = await chrome.storage.local.get([dateKey]);
      const visits = result[dateKey] || {};
      if (visits[domain] && visits[domain] > 0) {
        visitedDays++;
      }
    }

    return visitedDays;
  }

  async getTodayDuration(domain) {
    const today = new Date().toDateString();
    const durationKey = `duration_${today}`;
    
    const result = await chrome.storage.local.get([durationKey]);
    const durations = result[durationKey] || {};
    return durations[domain] || 0;
  }

  bindEvents() {
    // 打开设置页面
    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    // 切换插件启用/禁用状态
    document.getElementById('disableExtension').addEventListener('click', async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'toggleExtension' });
        this.isEnabled = response.isEnabled;
        this.updateToggleButton();
      } catch (error) {
        console.error('切换插件状态失败:', error);
      }
    });
  }

  updateToggleButton() {
    const toggleButton = document.getElementById('disableExtension');
    if (this.isEnabled) {
      toggleButton.textContent = '关闭插件';
      toggleButton.classList.remove('btn-success');
      toggleButton.classList.add('btn-secondary');
    } else {
      toggleButton.textContent = '启用插件';
      toggleButton.classList.remove('btn-secondary');
      toggleButton.classList.add('btn-success');
    }
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // 提取一级域名（如从www.bilibili.com提取bilibili.com）
      // 匹配最后两个部分作为一级域名
      const domainParts = hostname.split('.');
      
      // 如果只有两部分或更少（如bilibili.com或localhost），直接返回
      if (domainParts.length <= 2) {
        return hostname;
      }
      
      // 否则返回最后两部分（如从www.bilibili.com返回bilibili.com）
      return domainParts.slice(-2).join('.');
    } catch {
      return null;
    }
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  new AwareMePopup();
});