import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { SocketIoConfig, SocketIoModule } from 'ngx-socket-io';
const config: SocketIoConfig = { url: 'http://127.0.0.1:3000', options: { transports: ['websocket'], path: '/' } };
export const appConfig: ApplicationConfig = {
  providers: [importProvidersFrom(SocketIoModule.forRoot(config)), provideRouter(routes)]
};
