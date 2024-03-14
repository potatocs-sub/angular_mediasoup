import { Component, ElementRef, Inject, PLATFORM_ID, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Socket } from 'ngx-socket-io';
import * as mediasoupClient from "mediasoup-client";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  mediaType = {
    audio: 'audioType',
    video: 'videoType',
    screen: 'screenType'
  }
  title = 'angular_mediasoup2';

  audioParams = {};
  videoParams = {};
  rtpCapabilities = {};
  device: any;
  producerTransport: any;
  consumerTransport: any;
  audioProducer: any;
  videoProducer: any;
  consumingTransports: any = [];
  consumerTransports: any = [];


  joined: boolean = false;


  @ViewChild('localMedia') localMediaEl!: ElementRef<HTMLDivElement>;
  @ViewChild('remoteVideos') remoteVideosEl!: ElementRef<HTMLDivElement>;
  @ViewChild('remoteAudios') remoteAudiosEl!: ElementRef<HTMLDivElement>;

  @ViewChild('audioSelect') audioSelectEl!: ElementRef<HTMLSelectElement>;
  @ViewChild('videoSelect') videoSelectEl!: ElementRef<HTMLSelectElement>;


  @ViewChild('roomIdInput') roomIdInputEl!: ElementRef<HTMLInputElement>;
  @ViewChild('nameInput') nameInputEl!: ElementRef<HTMLInputElement>;




  videoSelect!: HTMLSelectElement;

  roomIdInput!: HTMLInputElement;
  nameInput!: HTMLInputElement;

  constructor(
    @Inject(PLATFORM_ID) private _platform: Object,
    private socket: Socket
  ) { }

  ngAfterViewInit(): void {
    this.initializeElements();

    // this.getLocalStream()
  }

  private initializeElements(): void {


    this.roomIdInput = this.roomIdInputEl.nativeElement;
    this.nameInput = this.nameInputEl.nativeElement;
  }



  //1. 클라이언트에 연결된 카메라, 오디오 등의 장치 데이터를 받아온다
  getLocalStream = async () => {
    if (isPlatformBrowser(this._platform) && 'mediaDevices' in navigator) {
      // await navigator.mediaDevices.getUserMedia({
      //   audio: true,
      //   video: {
      //     width: { min: 640, max: 1920 },
      //     height: { min: 400, max: 1080 },
      //     deviceId: this.videoSelect.value
      //   },

      // }).then(this.streamSuccess).catch((error) => {
      //   console.log(error.message)
      // })
    }
  }

  streamSuccess = (stream: any) => {
    // const localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
    // localVideo.srcObject = stream;
    // localVideo.play();

    this.audioParams = { track: stream.getAudioTracks()[0], ...this.audioParams };
    this.videoParams = { track: stream.getVideoTracks()[0], ...this.videoParams };
  }

  rc: any = null;
  name: string = '';
  room_id: string = '';

  consumers = new Map()
  producers = new Map()

  _isOpen = false

  producerLabel = new Map()

  // 방 참가 함수
  async joinRoom() {
    const name = this.nameInput.value;
    const room_id = this.roomIdInput.value;

    if (this.rc && this.rc.isOpen()) {
      console.log('Already connected to a room')
    } else {
      // 방 생성
      await this.socket.emit('createRoom', { room_id }, async (response: any) => {
        // 일단 만들려고 시도
        // 방 참가
        await this.socket.emit('join', { name, room_id }, async (response: any) => {
          this.joined = true;
          // console.log('join to room', response)
          // 통신을 위해 필요한 미디어 수준 정보 요청 
          await this.socket.emit('getRouterRtpCapabilities', {}, async (data: any) => {
            // 현재 브라우저가 서버에서 필요한 미디어 수준을 만족하는지 확인
            let device = await this.loadDevice(data);
            this.device = device;
            // 초기 연결 설정 producer , consumer 연결 transport 
            await this.initTransports(device)
            this.initEnumerateDevices()
          })
        })
      })

      // addListeners()
    }
  }

  async loadDevice(routerRtpCapabilities: any) {
    let device;
    try {
      device = new mediasoupClient.Device()
    } catch (error: any) {
      if (error.name === 'UnsupportedError') {
        console.error("Browser not supperted");
        alert('Browser not supported')
      }
      console.error(error)
    }
    await device?.load({
      routerRtpCapabilities
    })

    return device;
  }

  // 연결 초기 설정
  async initTransports(device: any) {
    // init producerTransport
    {
      await this.socket.emit("createWebRtcTransport", {
        forceTcp: false,
        rtpCapabilities: device.rtpCapabilities
      }, async (data: any) => {
        if (data.error) {
          console.error(data.error)
          return
        }


        // transport 생성 
        // producer = 제공자, 내가 보내는 전송 선 생성
        this.producerTransport = device.createSendTransport(data)

        // 연결
        this.producerTransport.on(
          'connect',
          async ({ dtlsParameters }: any, callback: any, errback: any) => {
            await this.socket.emit('connectTransport', {
              dtlsParameters,
              transport_id: data.id
            }, (response: any) => response)
            callback();
          }
        )

        // server에 producer를 생성하라고 요청
        this.producerTransport.on(
          'produce',
          async ({ kind, rtpParameters }: any, callback: any, errback: any) => {
            try {
              await this.socket.emit('produce', {
                producerTransportId: this.producerTransport.id,
                kind,
                rtpParameters
              }, ({ producer_id }: any) => {
                callback({ id: producer_id })
              })
            } catch (err) {
              errback(err)
            }
          }
        )

        // 중복 연결 방지
        this.producerTransport.on(
          'connectionstatechange',
          (state: any) => {
            switch (state) {
              case 'connecting':
                break;

              case 'connected':
                break;

              case 'failed':
                this.producerTransport.close()
                break;

              default:
                break;
            }
          }
        )
      })
    }

    // init consumerTransport
    {
      await this.socket.emit('createWebRtcTransport', {
        forceTcp: false
      }, async (data: any) => {
        if (data.error) {
          console.error(data.error)
          return
        }

        // only one needed
        this.consumerTransport = device.createRecvTransport(data)

        this.consumerTransport.on(
          'connect',
          async ({ dtlsParameters }: any, callback: any, errback: any) => {
            try {
              await this.socket.emit('connectTransport', {
                transport_id: this.consumerTransport.id,
                dtlsParameters
              }, (response: any) => {
                callback(response)
              })
            } catch (err) {
              errback(err)
            }
          }
        )

        // 마찬가지로 중복 연결 방지
        this.consumerTransport.on(
          'connectionstatechange',
          async (state: any) => {
            switch (state) {
              case 'connecting':
                break;

              case 'connected':
                break;

              case 'failed':
                this.consumerTransport.close()
                break;

              default:
                break;
            }
          }
        )


        // 받을 준비가 되면 getProducers 시전
        await this.socket.emit('getProducers')
        this.initSockets()
        this._isOpen = true
      })
    }
  }



  initSockets() {
    // 받는게 하나 닫힘
    this.socket.on(
      'consumerClosed',
      ({ consumer_id }: any) => {
        console.log('Closing consumer:', consumer_id);
        this.removeConsumer(consumer_id)
      }
    )

    // 새로운 연결 들어옴
    this.socket.on(
      'newProducers',
      async (data: any) => {
        console.log('Now Producers', data)
        for (let { producer_id } of data) {
          await this.consume(producer_id)
        }
      }
    )

    this.socket.on(
      'disconnect',
      () => {
        this.exit(true)
      }
    )
  }

  // consume 즉, 수신 설정
  async consume(producer_id: any) {

    this.getConsumeStream(producer_id).then(
      ({ consumer, stream, kind }: any) => {
        this.consumers.set(consumer.id, consumer)

        let elem;
        if (kind === 'video') {
          elem = document.createElement('video');
          elem.srcObject = stream;
          elem.id = consumer.id;
          elem.playsInline = false;
          elem.autoplay = true;
          elem.className = 'vid';
          elem.width = 300;

          this.remoteVideosEl.nativeElement.appendChild(elem);
          this.handleFS(elem.id)
        } else {
          elem = document.createElement('audio')
          elem.srcObject = stream
          elem.id = consumer.id
          // elem.playsInline = false
          elem.autoplay = true
          this.remoteAudiosEl.nativeElement.appendChild(elem)
        }

        consumer.on(
          'trackended',
          () => {
            this.removeConsumer(consumer.id)
          }
        )

        consumer.on(
          'transportclose',
          () => {
            this.removeConsumer(consumer.id)
          }
        )
      }
    )
  }




  async getConsumeStream(producerId: any) {
    // 요구 조건 확인
    const { rtpCapabilities } = this.device;
    console.log(rtpCapabilities)
    return new Promise(async (resolve, reject) => {
      console.log(this.consumerTransport)
      await this.socket.emit("consume", {
        rtpCapabilities,
        consumerTransportId: this.consumerTransport.id,
        producerId
      }, async (data: any) => {
        try {
          const { id, kind, rtpParameters } = data;

          console.log(data)
          let codecOptions = {};

          const consumer = await this.consumerTransport.consume({
            id,
            producerId,
            kind,
            rtpParameters,
            codecOptions
          })

          const stream = new MediaStream()
          stream.addTrack(consumer.track)


          console.log(consumer, stream, kind)
          resolve({
            consumer,
            stream,
            kind
          })
        } catch (error) {
          reject(error);
        }

      })
    })

  }

  // 나가기 함수
  exit(offline = false) {
    // this.socket.emit('exitRoom', ())
    let clean = () => {
      this._isOpen = false
      this.consumerTransport.close();
      this.producerTransport.close();
      this.socket.off('disconnect')
      this.socket.off('newProducers')
      this.socket.off('consumerClosed')
    }

    if (!offline) {
      this.socket
        .emit('exitRoom', {}, () => {
          clean()
        })
    } else {
      clean()
    }
  }


  // 연결 제거 함수
  removeConsumer(consumer_id: any) {
    let elem: any = document.getElementById(consumer_id) as HTMLVideoElement
    const stream = elem.srcObject;
    const tracks = stream.getTracks();
    tracks.forEach(function (track: any) {
      track.stop()
    })
    elem.parentNode.removeChild(elem)

    this.consumers.delete(consumer_id)
  }


  // 디바이스 접근 가능 여부
  isEnumerateDevices = false


  initEnumerateDevices() {
    if (this.isEnumerateDevices) return;

    const constraints = {
      audio: true,
      video: true
    }

    if (isPlatformBrowser(this._platform) && 'mediaDevices' in navigator) {
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {

          this.enumerateDevices()
          stream.getTracks().forEach(function (track) {
            track.stop()
          })
        })
        .catch((err) => {
          console.error('Access denied for audio/video: ', err)
        })
    }
  }

  enumerateDevices() {
    navigator.mediaDevices.enumerateDevices().then((devices: any) => {
      devices.forEach((device: any) => {
        let el: any = null
        if ('audioinput' === device.kind) {
          el = this.audioSelectEl?.nativeElement
        } else if ('videoinput' === device.kind) {
          el = this.videoSelectEl?.nativeElement
        }
        if (!el) return

        let option = document.createElement('option');
        option.value = device.deviceId
        option.innerText = device.label
        el.appendChild(option)
        this.isEnumerateDevices = true
      })
    })

  }

  handleFS(id: any) {
    let videoPlayer = document.getElementById(id);

    // videoPlayer?.addEventListener()
  }





  //====== MAIN FUNCTION
  async produce(type: any, deviceId: any = null) {
    let mediaConstraints = {};
    let audio = false;
    let screen = false;
    switch (type) {
      case this.mediaType.audio:
        deviceId = this.audioSelectEl.nativeElement.value;
        mediaConstraints = {
          audio: {
            deviceId: deviceId
          },
          video: false
        }
        audio = true
        break;
      case this.mediaType.video:
        deviceId = this.videoSelectEl.nativeElement.value;
        mediaConstraints = {
          audio: false,
          video: {
            width: {
              min: 640,
              ideal: 1920
            },
            height: {
              min: 400,
              ideal: 1080
            },
            deviceId: deviceId
          }
        }
        break;
      case this.mediaType.screen:
        mediaConstraints = false
        screen = true
        break;
      default:
        return;
    }
    if (!this.device.canProduce('video') && !audio) {
      console.error('Cannot produce video')
      return
    }
    if (this.producerLabel.has(type)) {
      console.log('Producer already exists fot this type ' + type);
      return
    }
    console.log('Mediacontraints:', mediaConstraints);

    let stream;

    try {
      stream = screen ? await navigator.mediaDevices.getDisplayMedia() : await navigator.mediaDevices.getUserMedia(mediaConstraints)
      console.log(navigator.mediaDevices.getSupportedConstraints())

      const track = audio ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0]
      const params: any = {
        track
      }

      if (!audio && !screen) {
        params.encodings = [
          {
            rid: 'r0',
            maxBitrate: 100000,
            scalabilityMode: 'S2T3'
          },
          {
            rid: 'r1',
            maxBitrate: 300000,
            scalabilityMode: 'S2T3'
          },
          {
            rid: 'r2',
            maxBitrate: 900000,
            scalabilityMode: 'S2T3'
          },
          {
            rid: 'r3',
            maxBitrate: 1800000,
            scalabilityMode: 'S2T3'
          },
          {
            rid: 'r4',
            maxBitrate: 2700000,
            scalabilityMode: 'S2T3'
          },
          {
            rid: 'r5',
            maxBitrate: 3600000,
            scalabilityMode: 'S2T3'
          }
        ]
        params.codecOptions = {
          videoGoogleStartBitrate: 1000
        }
      }


      let producer = await this.producerTransport.produce(params)

      this.producers.set(producer.id, producer)

      let elem: any;
      if (!audio) {

        elem = document.createElement('video')
        elem.srcObject = stream
        elem.id = producer.id
        elem.playsInline = false
        elem.autoplay = true
        elem.className = 'vid'
        elem.width = 300;



        this.localMediaEl.nativeElement.appendChild(elem)
        this.handleFS(elem.id)
      }

      producer.on('trackended', () => {
        this.closeProducer(type)
      })

      producer.on('transportclose', () => {
        console.log('Producer transport close')
        if (!audio) {
          elem.srcObject.getTracks().forEach(function (track: any) {
            track.stop()
          })
          elem.parentNode.removeChild(elem)
        }
        this.producers.delete(producer.id)
      })

      producer.on('close', () => {
        console.log('Closing producer')
        if (!audio) {
          elem.srcObject.getTracks().forEach(function (track: any) {
            track.stop()
          })
          elem.parentNode.removeChild(elem)
        }
        this.producers.delete(producer.id)
      })

      this.producerLabel.set(type, producer.id)

      // switch (type) {
      //   case this.mediaType.audio:
      //     this.event(_EVENTS.startAudio)
      //     break
      //   case this.mediaType.video:
      //     this.event(_EVENTS.startVideo)
      //     break
      //   case this.mediaType.screen:
      //     this.event(_EVENTS.startScreen)
      //     break
      //   default:
      //     return
      // }
    } catch (err: any) {
      console.log('Produce error:', err)
    }
  }

  closeProducer(type: any) {
    if (!this.producerLabel.has(type)) {
      console.log('There is no producer for this type ' + type)
      return
    }

    let producer_id = this.producerLabel.get(type)
    console.log('Close producer', producer_id)

    this.socket.emit('producerClosed', {
      producer_id
    })

    this.producers.get(producer_id).close()
    this.producers.delete(producer_id)
    this.producerLabel.delete(type)

    if (type !== this.mediaType.audio) {
      let elem: any = document.getElementById(producer_id)
      elem.srcObject.getTracks().forEach(function (track: any) {
        track.stop()
      })
      elem.parentNode.removeChild(elem)
    }

    // switch (type) {
    //   case mediaType.audio:
    //     this.event(_EVENTS.stopAudio)
    //     break
    //   case mediaType.video:
    //     this.event(_EVENTS.stopVideo)
    //     break
    //   case mediaType.screen:
    //     this.event(_EVENTS.stopScreen)
    //     break
    //   default:
    //     return
    // }
  }
}
