import { Config } from '@remotion/cli/config';

// Les captures de l'app vivent avec le README, dans docs/media/screens : une seule copie pour les deux.
Config.setPublicDir('../docs/media/screens');
Config.setVideoImageFormat('png');
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
