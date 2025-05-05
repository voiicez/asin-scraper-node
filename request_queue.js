// request_queue.js
class RequestQueue {
  constructor(maxConcurrent = 5, maxQueueSize = 100) {
    this.queue = [];
    this.processing = 0;
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
  }

  async add(taskFunction, priority = 0) {
    return new Promise((resolve, reject) => {
      // Kuyruk doluysa reddet
      if (this.queue.length >= this.maxQueueSize) {
        return reject(new Error('Queue is full'));
      }
      
      // Kuyruğa eklenmek üzere bir görev oluştur
      const task = {
        task: taskFunction,
        resolve,
        reject,
        priority, // Öncelik ekleniyor
        timestamp: Date.now() // Zaman damgası ekleniyor
      };
      
      // Kuyruğa ekle ve önceliğe göre sırala
      this.queue.push(task);
      this.queue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);
      
      this.processNext();
    });
  }

  async processNext() {
    // Eğer işlem kapasitesi doluysa veya kuyrukta görev yoksa işlem yapma
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    // Kuyruktan bir görev al
    const task = this.queue.shift();
    this.processing++;
    
    try {
      // Görevi çalıştır
      const result = await task.task();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.processing--;
      // Bir sonraki görevi işle
      this.processNext();
    }
  }
}

module.exports = RequestQueue;