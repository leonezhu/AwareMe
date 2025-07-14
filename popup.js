// AwareMe 弹出窗口脚本

class AwareMePopup {
  constructor() {
    this.isEnabled = true; // 默认启用状态
    this.config = null;
    this.init();
  }

  async init() {
    await this.loadExtensionStatus();
    await this.loadConfig();
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

  async loadConfig() {
    this.config = await AwareMeUtils.loadConfig();
    console.log('加载配置:', this.config);
  }



  async loadCurrentSite() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('当前标签页:', tabs);
      if (tabs[0] && tabs[0].url) {
        const domain = AwareMeUtils.extractDomain(tabs[0].url);
        console.log('提取的域名:', domain);
        
        // 检查是否为有效域名且在配置中
        if (domain && !domain.startsWith('chrome') && AwareMeUtils.isDomainConfigured(domain, this.config)) {
          document.getElementById('currentSite').style.display = 'block';
          document.getElementById('currentDomain').textContent = domain;

          // 获取今日在该网站的访问次数
          const todayVisits = await AwareMeStats.getTodayVisits(domain);
          console.log('今日访问次数:', todayVisits);
          document.getElementById('todayVisits').textContent = todayVisits;

          // 获取今日在该网站的浏览时长
          const todayDuration = await AwareMeStats.getTodayDuration(domain);
          const minutes = Math.round(todayDuration / (1000 * 60));
          console.log('今日浏览时长:', todayDuration, '分钟:', minutes);
          document.getElementById('todayDuration').textContent = `${minutes} min`;

          // 获取本周在该网站的访问天数
          const weeklyVisits = await AwareMeStats.getWeeklyVisitDays(domain);
          console.log('本周访问天数:', weeklyVisits);
          document.getElementById('weeklyVisits').textContent = weeklyVisits;
        } else {
          console.log('域名无效、为chrome页面或不在配置中，不显示统计');
          document.getElementById('currentSite').style.display = 'none';
        }
      } else {
        console.log('没有找到有效的标签页');
      }
    } catch (error) {
      console.error('加载当前网站信息失败:', error);
    }
  }



  bindEvents() {
    // 打开设置页面
    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    // 清理旧数据
    document.getElementById('cleanupData').addEventListener('click', async () => {
      const button = document.getElementById('cleanupData');
      const originalText = button.textContent;
      
      try {
        button.textContent = '清理中...';
        button.disabled = true;
        
        const response = await chrome.runtime.sendMessage({ type: 'cleanupOldRecords' });
        
        if (response.success) {
          const result = response.result;
          if (result.totalDeleted > 0) {
            button.textContent = `已清理 ${result.totalDeleted} 条`;
            // 重新加载当前网站数据以反映清理后的状态
            await this.loadCurrentSite();
          } else {
            button.textContent = '无需清理';
          }
        } else {
          button.textContent = '清理失败';
        }
        
        // 2秒后恢复按钮状态
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);
      } catch (error) {
        console.error('清理数据失败:', error);
        button.textContent = '清理失败';
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2000);
      }
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


}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  new AwareMePopup();
}, { passive: true });