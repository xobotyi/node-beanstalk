/* eslint-disable no-param-reassign */
export interface ILinkedListNode<V = any> {
  readonly value: V;

  list: LinkedList | undefined;
  next: ILinkedListNode | undefined;
  prev: ILinkedListNode | undefined;
}

export class LinkedList<V = any> {
  head: ILinkedListNode<V> | undefined;

  tail: ILinkedListNode<V> | undefined;

  size = 0;

  /**
   * Remove node from chain and nullish it.
   */
  removeNode<T extends V>(node: ILinkedListNode<T>): ILinkedListNode<T> | undefined {
    const { next, prev } = node;

    if (prev) prev.next = next;
    if (next) next.prev = prev;

    if (node === this.head) this.head = next;
    if (node === this.tail) this.tail = prev;

    node.next = undefined;
    node.prev = undefined;
    node.list = undefined;

    this.size--;

    return next;
  }

  /**
   * Push existing list node to list's endings
   */
  pushNode<T extends V>(node: ILinkedListNode<T>): ILinkedListNode<T> {
    node.list = this;
    node.prev = this.tail;

    if (this.tail) {
      this.tail.next = node;
    }

    this.tail = node;
    if (!this.head) {
      this.head = node;
    }

    this.size++;

    return node;
  }

  /**
   * Add {value} to the tail of the list.
   */
  push<T extends V>(value: T): ILinkedListNode<T> {
    return this.pushNode({
      list: this,
      value,
      next: undefined,
      prev: undefined,
    });
  }

  /**
   * Remove {count} elements from the head of the list.
   *
   * @return Array containing removed values.
   */
  shrinkHead(count = 1): V[] {
    if (!this.head) return [];

    const removed: V[] = [];
    while (count && this.head) {
      removed.push(this.head.value);
      this.removeNode(this.head);

      count--;
    }

    return removed;
  }

  /**
   * Remove all items from list.
   * Also dereferences existing list nodes.
   */
  truncate(): V[] {
    let item = this.head;

    const items: V[] = [];

    while (item) {
      const { next } = item;

      this.removeNode(item);

      items.push(item.value);
      item = next;
    }

    return items;
  }
}
