class ContextManager {
    constructor() {
      this.contexts = new Map();
    }
  
    getContext(userId) {
      if (!this.contexts.has(userId)) {
        this.contexts.set(userId, { 
          greeted: false, 
          pendingAction: null, 
          data: {},
          intentos: 0
        });
      }
      return this.contexts.get(userId);
    }
  
    updateContext(userId, updates) {
      const context = this.getContext(userId);
      this.contexts.set(userId, { ...context, ...updates });
    }
  
    clearContext(userId) {
      this.contexts.delete(userId);
    }
  }
  
  module.exports = new ContextManager();