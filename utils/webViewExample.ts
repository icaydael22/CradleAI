import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

// 直接从 assets 加载 HTML 文件内容
export const getWebViewExampleHtml = async (): Promise<string> => {
  try {
    const asset = Asset.fromModule(require('../assets/example-webview.html'));
    await asset.downloadAsync();

    if (asset.localUri) {
      return await FileSystem.readAsStringAsync(asset.localUri);
    }

    throw new Error('Failed to load WebView example HTML');
  } catch (error) {
    console.error('Error loading WebView example:', error);
    // Fallback to embedded HTML
    return getEmbeddedWebViewHtml();
  }
};

// Embedded version of the HTML as fallback
export const getEmbeddedWebViewHtml = (): string => {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>听歌状态栏 - 科技怪诞版</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');
        
        body {
            font-family: 'Orbitron', sans-serif;
            margin: 0;
            background-color: #0a0a0a;
        }

        .music-container {
            width: 80%;
            max-width: 320px;
            border-radius: 25px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
            position: relative;
            margin: 20px auto;
            background: linear-gradient(45deg, #00ffff, #ff00ff, #00ff00);
            background-size: 200% 200%;
            animation: neonGradient 8s ease infinite;
        }@keyframes neonGradient {
            0% { background-position: 0% 0%; }
            50% { background-position: 100% 100%; }
            100% { background-position: 0% 0%; }
        }

        .background-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: url('https://files.catbox.moe/lbr7m9.jpg');
            background-size: cover;
            filter: blur(11.25px) opacity(0.6);
            z-index: 0;
        }

        .content {
            position: relative;
            z-index: 1;
            padding: 20px;
            color: #fff;
            text-align: center;
        }

        .cover-image {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            overflow: hidden;
            margin: 0 auto 15px;
            border: 2px solid #fff;
            box-shadow: 0 0 15px #00ffff, 0 0 30px #ff00ff;
            animation: rotate 5s linear infinite, hoverGlow 2s ease-in-out infinite;
        }

        .cover-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        @keyframes hoverGlow {
            0%, 100% { transform: translateY(0); box-shadow: 0 0 15px #00ffff; }
            50% { transform: translateY(-10px); box-shadow: 0 0 25px #ff00ff; }
        }

        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .song-info {
            margin-bottom: 15px;
        }

        .song-title {
            font-size: 20px;
            color: #fff;
            text-shadow: 0 0 10px #87CEEB;
        }

        .song-artist {
            font-size: 14px;
            color: #D3D3D3;
            text-shadow: 0 0 5px #87CEEB;
        }.song-artist {
            font-size: 14px;
            color: #D3D3D3;
            text-shadow: 0 0 5px #87CEEB;
        }

        .button-group {
            display: flex;
            justify-content: center;
            gap: 10px;
            padding: 10px;
            border: 2px solid #87CEEB;
            border-radius: 10px;
            margin: 10px 0;
        }

        .control-button {
            background: transparent;
            border: 2px solid #87CEEB;
            padding: 10px;
            border-radius: 5px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            color: #87CEEB;
            transition: all 0.3s ease;
            animation: buttonGlow 2s ease-in-out infinite;
        }

        .control-button:hover {
            box-shadow: 0 0 15px #87CEEB;
            color: #fff;
            transform: scale(1.05);
        }

        @keyframes buttonGlow {
            0%, 100% { box-shadow: 0 0 5px #87CEEB; }
            50% { box-shadow: 0 0 15px #87CEEB; }
        }audio {
            display: block;
            margin: 10px auto;
            width: 100%;
        }

        .ecg-line {
            position: absolute;
            bottom: 10px;
            left: 0;
            width: 100%;
            height: 20px;
            z-index: 1;
        }

        .ecg-line svg {
            width: 100%;
            height: 100%;
            stroke: #00ffff;
            stroke-width: 2;
            fill: none;
            animation: ecgMove 2s linear infinite;
        }

        @keyframes ecgMove {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -50; }
        }

        .lyrics-container {
            background-color: rgba(255, 255, 255, 0.3);
            border-radius: 15px 5px 20px 10px;
            padding: 15px;
            font-family: serif;
            font-size: 14px;
            color: #fff;
            line-height: 1.6;
            animation: warp 4s ease-in-out infinite;
        }

        details[open] .lyrics-content {
            max-height: 160px;
            overflow-y: auto;
        }

        .lyrics-content::-webkit-scrollbar {
            width: 0px;
        }

        @keyframes warp {
            0%, 100% { transform: skew(0deg); }
            50% { transform: skew(2deg); }
        }

        @media (max-width: 480px) {
            .music-container { width: 90%; }
            .content { padding: 10px; }
            .cover-image { width: 80px; height: 80px; }
            .song-title { font-size: 18px; }
            .song-artist { font-size: 12px; }
        }
    </style>
</head><body>
    <div class="music-container">
        <div class="background-image"></div>
        <div class="content">
            <div class="cover-image">
                <img src="https://files.catbox.moe/jdhssp.jpg" alt="专辑封面">
            </div>
            <div class="song-info">
                <div class="song-title">You Should See Me in a Crown</div>
                <div class="song-artist">Billie Eilish</div>
            </div>
            <div class="button-group">
                <button class="control-button prev-button" onclick="prevSong()">⏮</button>
                <button class="control-button play-button" onclick="togglePlay()">■</button>
                <button class="control-button next-button" onclick="nextSong()">⏭</button>
            </div>
            <audio id="audio">
                <source src="https://files.catbox.moe/za8qay.mp3" type="audio/mpeg">
            </audio>
            <div class="ecg-line">
                <svg viewBox="0 0 100 20">
                    <path d="M0 10 H20 L25 5 L30 15 L35 5 L40 10 H100" stroke-dasharray="50"/>
                </svg>
            </div><details class="lyrics-container">
                <summary>歌词</summary>
                <div class="lyrics-content">
                    <p>Bite my tongue, bide my time<br>咬紧牙关，等候最佳时机<br>Wearing a warning sign<br>发散出危险警告的气息<br>Wait 'til the world is mine<br>等着世界属于我的那刻到来<br>Visions I vandalize<br>我破坏了那些幻想<br>Cold in my kingdom size<br>在我庞大的王国里冷酷无情<br>Fell for these ocean eyes<br>坠入这海洋般的眼眸<br>You should see me in a crown<br>你应该看到我头戴皇冠衣冠整齐的模样<br>I'm gonna run this nothing town<br>我将改变这个穷途末路的地方<br>Watch me make 'em bow<br>看我如何称王<br>One by one by one<br>一个接一个<br>You should see me in a crown<br>你应该看到我头戴皇冠衣冠整齐的模样<br>Your silence is my favorite sound<br>你的沉默是我最爱的声音<br>Watch me make 'em bow<br>看我如何称王<br>One by one by one<br>一个接一个</p>
                </div>
            </details>
        </div>
    </div>

    <script>const songs = [
            { 
                src: 'https://files.catbox.moe/8huvgq.mp3',
                title: 'You Should See Me in a Crown',
                artist: 'Billie Eilish',
                lyrics: 'Bite my tongue, bide my time<br>咬紧牙关，等候最佳时机<br>Wearing a warning sign<br>发散出危险警告的气息<br>Wait \'til the world is mine<br>等着世界属于我的那刻到来<br>Visions I vandalize<br>我破坏了那些幻想<br>Cold in my kingdom size<br>在我庞大的王国里冷酷无情<br>Fell for these ocean eyes<br>坠入这海洋般的眼眸<br>You should see me in a crown<br>你应该看到我头戴皇冠衣冠整齐的模样<br>I\'m gonna run this nothing town<br>我将改变这个穷途末路的地方<br>Watch me make \'em bow<br>看我如何称王<br>One by one by one<br>一个接一个<br>You should see me in a crown<br>你应该看到我头戴皇冠衣冠整齐的模样<br>Your silence is my favorite sound<br>你的沉默是我最爱的声音<br>Watch me make \'em bow<br>看我如何称王<br>One by one by one<br>一个接一个'
            },
            { 
                src: 'https://files.catbox.moe/za8qay.mp3',
                title: 'Mirror Masa',
                artist: 'DATHAN',
                lyrics: 'Mirror, mirror on the wall 墙上的镜子，镜子 Who\'s the fairest of them all? 谁是其中最美的一个？ (重复多次，无更多歌词内容)'
            }
        ];let currentSongIndex = 0;
        const audio = document.getElementById('audio');
        const playButton = document.querySelector('.play-button');
        const songTitle = document.querySelector('.song-title');
        const songArtist = document.querySelector('.song-artist');
        const lyricsContent = document.querySelector('.lyrics-content p');

        function togglePlay() {
            if (audio.paused) {
                audio.play();
                playButton.textContent = 'Ⅱ';
            } else {
                audio.pause();
                playButton.textContent = '■';
            }
        }

        async function loadSong() {
            const song = songs[currentSongIndex];
            
            songTitle.textContent = song.title;
            songArtist.textContent = song.artist;
            lyricsContent.innerHTML = song.lyrics;

            if (audio.src !== song.src) {
                audio.src = song.src;
                await new Promise((resolve) => {
                    audio.addEventListener('canplay', resolve, { once: true });
                    audio.load();
                });
            }
        }

        async function nextSong() {
            currentSongIndex = (currentSongIndex + 1) % songs.length;
            await loadSong();
            audio.play();
            playButton.textContent = 'Ⅱ';
        }async function prevSong() {
            currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
            await loadSong();
            audio.play();
            playButton.textContent = 'Ⅱ';
        }

        // 初始化首首歌
        loadSong();

        // 自动播放下一首
        audio.addEventListener('ended', nextSong);

        // 错误处理
        audio.addEventListener('error', (e) => {
            console.error('播放错误:', e);
            alert('歌曲加载失败，请稍后再试');
        });
    </script>
</body>
</html>`;
};