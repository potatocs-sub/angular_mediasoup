import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { SocketIoConfig, SocketIoModule } from 'ngx-socket-io';
const config: SocketIoConfig = { url: 'wss://3.35.169.45:3000/', options: { transports: ['websocket'], path: '/socket/' } };
// const config: SocketIoConfig = { url: 'ws://localhost:3000/', options: { transports: ['websocket'], path: '/socket/' } };
export const appConfig: ApplicationConfig = {
  providers: [importProvidersFrom(SocketIoModule.forRoot(config)), provideRouter(routes)]
};
