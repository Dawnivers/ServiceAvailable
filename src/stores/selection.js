import { defineStore } from 'pinia';

export const useSelectionStore = defineStore('selection', {
  state: () => ({
    poi: null, //后端返回的POI点对象
    loading: false, //请求在途中为true 卡片显示：正在读取
    error: null, //出错时储存错误文案
    reqSeq: 0, //请求编号
  }), // 存什么
  getters: {}, // computed（可选）
  actions: {
    async setPoi(gid) {
      if (!gid) return;
      this.reqSeq += 1;
      const seq = this.reqSeq; //记录局部变量

      this.loading = true; //进入请求中状态
      this.error = null; //清除上一次的错误信息

      //连接后端请求数据
      try {
        const res = await fetch(`/api/poi/${gid}`);
        if (!res.ok) {
          this.error =
            res.status === 404 ? '该设施不存在' : `服务异常（${res.status}）`;
          this.poi = null;
          return; // ← 这行不能漏
        }

        const data = await res.json(); //json解析

        if (seq !== this.reqSeq) return;
        this.poi = data;
      } catch (e) {
        if (seq === this.reqSeq) {
          this.error = '网络异常';
          console.warn(e);
        }
      } finally {
        if (seq === this.reqSeq) this.loading = false;
      }
    },

    clear() {
      this.poi = null;
      this.error = null;
      this.loading = false;
      this.reqSeq += 1; // ← 这行容易漏
    },
  },
});
