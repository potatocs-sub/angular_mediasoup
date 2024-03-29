import { Component, ElementRef, Inject, PLATFORM_ID, Renderer2, ViewChild } from '@angular/core';
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


  joined: boolean = false; // join 됐는지 확인
  isVideo: boolean = false; // 비디오 송출하고 있는지 확인
  isAudio: boolean = false; // 오디오 송출하고 있는지 확인
  isScreen: boolean = false; // 화면 공유 하고 있는지 확인

  videoSelectToggle: boolean = false; // 비디오 셀렉트 박스 토글 확인용 변수
  audioSelectToggle: boolean = false; // 오디오 셀렉트 박스 토글 확인용 변수

  nowVideoValue: any;
  nowAudioValue: any;

  videoOptions: Array<any> = [];
  audioOptions: Array<any> = [];


  @ViewChild('localMedia') localMediaEl!: ElementRef<HTMLDivElement>;
  @ViewChild('remoteVideos') remoteVideosEl!: ElementRef<HTMLDivElement>;
  @ViewChild('remoteAudios') remoteAudiosEl!: ElementRef<HTMLDivElement>;

  @ViewChild('audioSelect') audioSelectEl!: ElementRef<HTMLSelectElement>;
  @ViewChild('videoSelect') videoSelectEl!: ElementRef<HTMLSelectElement>;


  @ViewChild('roomIdInput') roomIdInputEl!: ElementRef<HTMLInputElement>;
  @ViewChild('nameInput') nameInputEl!: ElementRef<HTMLInputElement>;

  @ViewChild('mainVideo') mainVideo!: ElementRef<HTMLDivElement>;



  videoSelect!: HTMLSelectElement;

  roomIdInput!: HTMLInputElement;
  nameInput!: HTMLInputElement;

  constructor(
    @Inject(PLATFORM_ID) private _platform: Object,
    private socket: Socket,
    private renderer: Renderer2
  ) { }

  audioToggle() {
    this.audioSelectToggle = !this.audioSelectToggle;
    if (this.videoSelectToggle) {
      this.videoSelectToggle = false;
    }
  }

  videoToggle() {
    this.videoSelectToggle = !this.videoSelectToggle;
    if (this.audioSelectToggle) {
      this.audioSelectToggle = false;
    }
  }


  changeAudioValue(e: any) {
    this.nowAudioValue = e.target.value
  }

  changeVideoValue(e: any) {
    this.nowVideoValue = e.target.value;
  }



  videoCapture(e: any) {
    // console.log(e);
    const canvas = document.createElement('canvas');
    canvas.width = e.clientWidth;
    canvas.height = e.clientHeight;

    canvas.getContext('2d')?.drawImage(e, 0, 0, canvas.width, canvas.height);
    const dataURL = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'capture.png';
    a.click();

  }

  ngAfterViewInit(): void {
    this.initializeElements();

    // this.getLocalStream()

    window.addEventListener('resize', (event: any) => {
      // console.log(this.mainVideo.nativeElement.children[0].children[1])
      const children: any = this.mainVideo.nativeElement.children[0].children[1];

      if (children) {
        children.width = 0;
        children.height = 0;



        children.height = this.mainVideo.nativeElement.clientHeight;
        children.removeAttribute('width');



        if (children.clientWidth > this.mainVideo.nativeElement.clientWidth) {
          children.width = this.mainVideo.nativeElement.clientWidth;
          children.removeAttribute('height');
        }

      }

    })
  }



  goToMainVideo(e: any): void {
    console.log(e.parentNode.className)
    // console.log(e.target.clientWidth, e.target.clientHeight)
    // console.log(this.mainVideo.nativeElement.children[0])
    // 클릭한게 main_video이면
    if (e.parentNode.className == 'main_video_section') {
      return;
    }

    const children: any = this.mainVideo.nativeElement?.children[0]?.children[1];
    // 이미 main에 보여주고 있는 영상이 있으면
    if (children) {
      children.height = 120;
      children.removeAttribute('width')
      children.style.position = ''
      children.style.left = '';
      children.style.transform = '';
      this.remoteVideosEl.nativeElement.appendChild(this.mainVideo.nativeElement.children[0]);
    }
    // e.style.position = 'absolute';
    // e.style.left = '50%';
    // e.style.transform = 'translateX(-50%)';

    e.children[1].height = this.mainVideo.nativeElement.clientHeight;
    e.children[1].removeAttribute('width');



    if (e.children[1].clientWidth > this.mainVideo.nativeElement.clientWidth) {
      e.children[1].width = this.mainVideo.nativeElement.clientWidth;
      e.children[1].removeAttribute('height');
    }




    this.mainVideo.nativeElement.appendChild(e)
  }

  private initializeElements(): void {


    this.roomIdInput = this.roomIdInputEl.nativeElement;
    this.nameInput = this.nameInputEl.nativeElement;
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
          // console.log(response)
          this.initEnumerateDevices()
          // console.log('join to room', response)
          // 통신을 위해 필요한 미디어 수준 정보 요청 
          await this.socket.emit('getRouterRtpCapabilities', {}, async (data: any) => {
            // 현재 브라우저가 서버에서 필요한 미디어 수준을 만족하는지 확인
            let device = await this.loadDevice(data);
            this.device = device;
            // 초기 연결 설정 producer , consumer 연결 transport 
            await this.initTransports(device)

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
              }, ({ producer_id, name, type }: any) => {

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
        for (let { producer_id, producer_socket_id } of data) {
          await this.consume(producer_id, producer_socket_id)
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


  createVideoContainer(name: string) {
    const video_container = document.createElement('div'); // 비디오 컨테이너
    const name_elem = document.createElement('div'); // 이름
    const guard = document.createElement('div'); // 가드



    video_container.style.position = 'relative';
    video_container.style.overflow = 'hidden';
    video_container.style.width = 'fit-content';


    // 이름
    name_elem.innerText = name;
    const nameStyle = name_elem.style;
    nameStyle.position = 'absolute';
    nameStyle.left = '3px';
    nameStyle.bottom = '6px';
    nameStyle.padding = '1px 3px';
    nameStyle.borderRadius = '5px';
    nameStyle.backgroundColor = 'rgba(0,0,0,0.5)'


    // 가드
    guard.style.width = '100%';
    guard.style.height = '100%';
    guard.style.position = 'absolute';
    guard.style.backgroundColor = 'rgba(0,0,0,0.3)'
    guard.style.display = 'none';
    guard.style.justifyContent = 'center';
    guard.style.alignItems = 'center';

    // 메뉴 버튼들



    // video_container.addEventListener('mouseenter', function () {
    //   guard.style.display = 'flex'
    // })

    // video_container.addEventListener('mouseleave', function () {
    //   guard.style.display = 'none'
    // })

    // video_container.appendChild(guard)
    video_container.appendChild(name_elem)

    return video_container
  }

  // consume 즉, 수신 설정
  async consume(producer_id: any, producer_socket_id: string) {

    this.getConsumeStream(producer_id, producer_socket_id).then(
      ({ consumer, stream, kind, name }: any) => {
        this.consumers.set(consumer.id, consumer)

        let elem: any;
        if (kind === 'video') {
          console.log(name, producer_socket_id)
          const video_container = this.createVideoContainer(name);

          elem = document.createElement('video');
          elem.srcObject = stream;
          elem.id = consumer.id;
          elem.playsInline = true;
          elem.autoplay = true;
          elem.muted = true;

          elem.style.boxSizing = 'border-box'
          elem.style.border = '2px solid rgba(0,0,0,0)'
          elem.className = `vid ${producer_socket_id}`;
          elem.height = 120;
          elem.style.borderRadius = '5px';

          video_container.onclick = (e: any) => { this.goToMainVideo(video_container) }
          video_container.ondblclick = (e: any) => { this.videoCapture(elem) }

          const children: any = this.mainVideo.nativeElement.children[0];

          if (!children) {
            elem.addEventListener('resize', () => {
              elem.height = this.mainVideo.nativeElement.clientHeight;
              elem.removeAttribute('width');

              if (elem.clientWidth > this.mainVideo.nativeElement.clientWidth) {
                elem.width = this.mainVideo.nativeElement.clientWidth;
                elem.removeAttribute('height');
              }


              elem.removeEventListener('resize', () => { console.log('제거') });
            })

            video_container.appendChild(elem)
            this.mainVideo.nativeElement.appendChild(video_container);
          } else {
            video_container.appendChild(elem)
            this.remoteVideosEl.nativeElement.appendChild(video_container);
          }



          this.handleFS(elem.id)
        } else {
          console.log(name, producer_socket_id)
          elem = document.createElement('audio')
          elem.srcObject = stream
          elem.id = consumer.id
          // elem.playsInline = false
          elem.autoplay = true;
          elem.pause();
          // 원격 오디오 요소 추가
          this.remoteAudiosEl.nativeElement.appendChild(elem)

          // 오디오 컨텍스트 생성
          let audioContext = new AudioContext();

          // 소스 노드 생성
          let source = audioContext.createMediaStreamSource(stream);

          // Analyser 노드 생성
          let analyser = audioContext.createAnalyser();
          source.connect(analyser);

          // FFT 크기 설정 (분석을 위한 배열의 크기)
          analyser.fftSize = 2048;
          let bufferLength = analyser.frequencyBinCount;
          let dataArray = new Uint8Array(bufferLength);

          let audioTime: any;

          // console.log(video);
          // 소리 데시벨 모니터링
          function monitorDecibel() {
            // FFT 데이터 가져오기
            analyser.getByteFrequencyData(dataArray);

            // 데시벨 값 계산
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            let average = sum / bufferLength;
            let decibel = 20 * Math.log10(average / 255);
            // console.log(decibel)
            // 임계값 초과 시 콘솔에 로그 출력
            // -20 데시벨
            if (decibel > -20) {
              const video: any = document.getElementsByClassName(`${producer_socket_id}`)[0];
              if (video) video.style.border = '2px solid rgba(255, 180, 18)'

              elem.play();
              if (audioTime) {
                clearTimeout(audioTime)
              }

              // console.log(`${name}의 소리가 -20dB를 초과했습니다!`);

              audioTime = setTimeout(() => {
                if (video) video.style.border = '2px solid rgba(0,0,0,0)'
                elem.pause();
              }, 3000);
            }

            // 주기적으로 모니터링
            requestAnimationFrame(monitorDecibel);
          }
          // 소리 데시벨 모니터링 시작
          monitorDecibel();
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




  async getConsumeStream(producerId: any, producer_socket_id: string) {
    // 요구 조건 확인
    const { rtpCapabilities } = this.device;
    console.log(rtpCapabilities)
    return new Promise(async (resolve, reject) => {
      console.log(this.consumerTransport)
      await this.socket.emit("consume", {
        rtpCapabilities,
        consumerTransportId: this.consumerTransport.id,
        producerId,
        producer_socket_id
      }, async (data: any) => {
        try {
          const { id, kind, rtpParameters } = data.params;

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
            kind,
            name: data.name
          })
        } catch (error) {
          reject(error);
        }

      })
    })

  }

  // 나가기 함수
  exit(offline = false) {
    this.joined = false;
    // this.socket.emit('exitRoom', ())
    let clean = () => {
      this._isOpen = false
      this.consumerTransport.close();
      this.producerTransport.close();
      this.socket.off('disconnect')
      this.socket.off('newProducers')
      this.socket.off('consumerClosed')
      this.isVideo = false;
      this.isAudio = false;
      this.isScreen = false;
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
    const parent = elem.parentNode;
    parent.parentNode.removeChild(parent)

    this.consumers.delete(consumer_id)
  }


  // 디바이스 접근 가능 여부
  isEnumerateDevices = false


  initEnumerateDevices() {
    this.enumerateDevices()
    // if (this.isEnumerateDevices) return;

    // const constraints = {
    //   audio: true,
    //   video: true
    // }

    // if (isPlatformBrowser(this._platform) && 'mediaDevices' in navigator) {
    //   navigator.mediaDevices
    //     .getUserMedia(constraints)
    //     .then((stream) => {


    //       stream.getTracks().forEach(function (track) {
    //         track.stop()
    //       })
    //     })
    //     .catch((err) => {
    //       console.error('Access denied for audio/video: ', err)
    //     })
    // }
  }

  enumerateDevices() {
    if (isPlatformBrowser(this._platform) && 'mediaDevices' in navigator) {
      // navigator.mediaDevices.getUserMedia({
      //   audio: false,
      //   video: {
      //     width: {
      //       min: 640,
      //       ideal: 1920
      //     },
      //     height: {
      //       min: 400,
      //       ideal: 1080
      //     },
      //     facingMode: { exact: "user" },
      //   }
      // })
      //   .then(stream => {
      //     // 비디오 요소에 스트림을 연결합니다.
      //     let elem: any;
      //     if (stream) {
      //       elem = document.createElement('video')
      //       elem.srcObject = stream;
      //       elem.style.backgroundColor = 'white';
      //       elem.playsInline = true;
      //       elem.autoplay = true;
      //       elem.muted = true; elem.height = 120;
      //       document.getElementsByClassName('cover_container')[0].appendChild(elem)
      //     }
      //   })
      //   .catch(error => {
      //     console.error('카메라 액세스 오류:', error);
      //   });
      navigator.mediaDevices.enumerateDevices().then((devices: any) => {
        devices.forEach((device: any) => {
          let el: any = null;
          // let nowValue: any = null;
          if ('audioinput' === device.kind) {
            // el = this.audioSelectEl?.nativeElement
            el = this.audioOptions;

            if (!this.nowAudioValue) {
              this.nowAudioValue = device.deviceId;
            }
          } else if ('videoinput' === device.kind) {
            // el = this.videoSelectEl?.nativeElement
            el = this.videoOptions;
            // nowValue = this.nowVideoValue;
            if (!this.nowVideoValue) {
              this.nowVideoValue = device.deviceId;
            }
          }

          if (el == null) return

          let option = document.createElement('option');
          option.value = device.deviceId
          option.innerText = device.label

          // if (!nowValue) {
          //   nowValue = device.deviceId;
          // }

          // el.appendChild(option)
          el.push(option)
          this.isEnumerateDevices = true
        })
        // console.log(this.videoOptions)
      }
      )
    }


  }

  handleFS(id: any) {
    let videoPlayer = document.getElementById(id);

    // videoPlayer?.addEventListener()
  }




  //====== MAIN FUNCTION
  async produce(type: any, deviceId: any = null) {
    let mediaConstraints: any = {};
    let audio = false;
    let screen = false;
    switch (type) {
      case this.mediaType.audio:
        this.isAudio = true;
        deviceId = this.nowAudioValue;
        mediaConstraints = {
          audio: {
            deviceId: deviceId
          },
          video: false
        }
        audio = true
        break;
      case this.mediaType.video:
        this.isVideo = true;
        deviceId = this.nowVideoValue;
        if (deviceId != '') {
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
              deviceId: deviceId,
            }
          }
        } else {
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
              facingMode: { exact: "user" },
            }
          }
        }

        break;
      case this.mediaType.screen:
        this.isScreen = true;
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
            maxBitrate: 3600000,
            scalabilityMode: 'S2T3'
          },
          // {
          //   rid: 'r3',
          //   maxBitrate: 3600000,
          //   scalabilityMode: 'S2T3'
          // }
        ]
        params.codecOptions = {
          videoGoogleStartBitrate: 1000
        }
      }



      let producer: any = undefined
      try {
        producer = await this.producerTransport.produce(params)
      } catch (err) {
        window.alert(err)
      }

      this.producers.set(producer.id, producer)

      let elem: any;
      if (!audio) {

        const video_container = this.createVideoContainer(this.nameInput.value + ' (me)');


        elem = document.createElement('video')
        elem.srcObject = stream
        elem.id = producer.id
        //https://velog.io/@huhyj97/html-video-%ED%83%9C%EA%B7%B8-%EB%AA%A8%EB%B0%94%EC%9D%BC-%EC%A0%84%EC%B2%B4%ED%99%94%EB%A9%B4-%EC%9D%B4%EC%8A%88feat.%EC%95%84%EC%9D%B4%ED%8F%B0
        elem.playsInline = true;
        elem.autoplay = true;
        elem.muted = true;
        elem.className = 'vid'
        elem.style.boxSizing = 'border-box'
        elem.style.border = '2px solid rgba(0,0,0,0)'
        elem.height = 120;
        elem.style.borderRadius = '5px';
        elem.style.zIndex = '0'



        video_container.onclick = (e: any) => { this.goToMainVideo(video_container) }
        video_container.ondblclick = (e: any) => { this.videoCapture(elem) }
        const children: any = this.mainVideo.nativeElement.children[0];

        if (!children) {
          elem.addEventListener('resize', () => {
            elem.height = this.mainVideo.nativeElement.clientHeight;
            elem.removeAttribute('width');

            if (elem.clientWidth > this.mainVideo.nativeElement.clientWidth) {
              elem.width = this.mainVideo.nativeElement.clientWidth;
              elem.removeAttribute('height');
            }


            elem.removeEventListener('resize', () => { console.log('제거') });
          })


          video_container.appendChild(elem)
          this.mainVideo.nativeElement.appendChild(video_container);

        } else {
          video_container.appendChild(elem)
          this.remoteVideosEl.nativeElement.appendChild(video_container)
        }

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
      if (type == this.mediaType.screen) {
        this.isScreen = false;
      }
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

    switch (type) {
      case this.mediaType.audio:
        this.isAudio = false;
        break
      case this.mediaType.video:
        this.isVideo = false;
        break
      case this.mediaType.screen:
        this.isScreen = false;
        break
      default:
        return
    }
  }
}
