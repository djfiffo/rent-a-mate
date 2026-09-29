import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { CreateMessageResult } from './messages.types.js';

/**
 * Bridges committed message writes to optional realtime transports.
 * Persistence stays in MessagesService; subscribers can only observe the
 * server-confirmed result and therefore cannot create a second message.
 */
@Injectable()
export class MessagesEvents {
  private readonly createdSubject = new Subject<CreateMessageResult>();

  readonly created$ = this.createdSubject.asObservable();

  publishCreated(message: CreateMessageResult): void {
    this.createdSubject.next(message);
  }
}
