/**
 * Priority Queue implementation for routing algorithms
 * Uses a binary heap for efficient operations
 */

export class PriorityQueue<T> {
  private heap: { item: T; priority: number }[] = [];
  private itemMap: Map<T, number> = new Map(); // Maps item to its index in the heap

  /**
   * Add an item to the queue with a priority
   * @param item The item to add
   * @param priority The priority of the item (lower values have higher priority)
   */
  enqueue(item: T, priority: number): void {
    // Check if item already exists
    if (this.itemMap.has(item)) {
      this.updatePriority(item, priority);
      return;
    }

    // Add to the end of the heap
    const element = { item, priority };
    this.heap.push(element);
    this.itemMap.set(item, this.heap.length - 1);
    
    // Bubble up to maintain heap property
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * Remove and return the item with the highest priority (lowest priority value)
   * @returns The item with highest priority or null if queue is empty
   */
  dequeue(): T | null {
    if (this.isEmpty()) {
      return null;
    }

    // Get the root element (highest priority)
    const root = this.heap[0];
    const item = root.item;

    // Move the last element to the root
    const lastElement = this.heap.pop()!;
    if (!this.isEmpty()) {
      this.heap[0] = lastElement;
      this.itemMap.set(lastElement.item, 0);
      
      // Bubble down to maintain heap property
      this.bubbleDown(0);
    }

    // Remove from item map
    this.itemMap.delete(item);

    return item;
  }

  /**
   * Check if the queue is empty
   * @returns True if the queue is empty, false otherwise
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Get the number of items in the queue
   * @returns The number of items in the queue
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Check if an item is in the queue
   * @param item The item to check
   * @returns True if the item is in the queue, false otherwise
   */
  contains(item: T): boolean {
    return this.itemMap.has(item);
  }

  /**
   * Update the priority of an item
   * @param item The item to update
   * @param newPriority The new priority value
   */
  updatePriority(item: T, newPriority: number): void {
    const index = this.itemMap.get(item);
    if (index === undefined) {
      throw new Error('Item not found in priority queue');
    }

    const oldPriority = this.heap[index].priority;
    this.heap[index].priority = newPriority;

    // Update heap position based on priority change
    if (newPriority < oldPriority) {
      this.bubbleUp(index);
    } else {
      this.bubbleDown(index);
    }
  }

  /**
   * Get the priority of an item without removing it
   * @param item The item to check
   * @returns The priority of the item or undefined if not found
   */
  getPriority(item: T): number | undefined {
    const index = this.itemMap.get(item);
    return index !== undefined ? this.heap[index].priority : undefined;
  }

  /**
   * Peek at the item with the highest priority without removing it
   * @returns The item with highest priority or null if queue is empty
   */
  peek(): T | null {
    return this.isEmpty() ? null : this.heap[0].item;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.heap = [];
    this.itemMap.clear();
  }

  /**
   * Get all items in the queue (in no particular order)
   * @returns Array of all items in the queue
   */
  getAllItems(): T[] {
    return this.heap.map(element => element.item);
  }

  /**
   * Bubble up an element to maintain heap property
   * @param index The index of the element to bubble up
   */
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      
      if (this.heap[parentIndex].priority <= this.heap[index].priority) {
        break;
      }
      
      // Swap elements
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  /**
   * Bubble down an element to maintain heap property
   * @param index The index of the element to bubble down
   */
  private bubbleDown(index: number): void {
    const length = this.heap.length;
    
    while (true) {
      let leftChildIndex = 2 * index + 1;
      let rightChildIndex = 2 * index + 2;
      let smallestChildIndex = index;
      
      // Find the smallest child
      if (leftChildIndex < length && 
          this.heap[leftChildIndex].priority < this.heap[smallestChildIndex].priority) {
        smallestChildIndex = leftChildIndex;
      }
      
      if (rightChildIndex < length && 
          this.heap[rightChildIndex].priority < this.heap[smallestChildIndex].priority) {
        smallestChildIndex = rightChildIndex;
      }
      
      // If the smallest child is not the current element, swap
      if (smallestChildIndex !== index) {
        this.swap(index, smallestChildIndex);
        index = smallestChildIndex;
      } else {
        break;
      }
    }
  }

  /**
   * Swap two elements in the heap
   * @param index1 The index of the first element
   * @param index2 The index of the second element
   */
  private swap(index1: number, index2: number): void {
    const temp = this.heap[index1];
    this.heap[index1] = this.heap[index2];
    this.heap[index2] = temp;
    
    // Update item map
    this.itemMap.set(this.heap[index1].item, index1);
    this.itemMap.set(this.heap[index2].item, index2);
  }
}