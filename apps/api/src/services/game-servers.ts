/**
 * Game Servers management via LinuxGSM
 *
 * Each game server is installed to /opt/game-servers/{shortName}/
 * under a dedicated `gsm` system user.
 */

import { run } from './shell.js'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, readdir, rm } from 'fs/promises'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

const GAME_SERVERS_BASE = '/opt/game-servers'
const GSM_USER = 'gsm'
const INSTALL_STATUS_DIR = '/tmp'

// ── Game server templates ────────────────────────────────────────────────────

export type GameCategory = 'FPS' | 'Survival' | 'Sandbox' | 'Racing' | 'RPG' | 'VoIP' | 'Inne'

export interface GameServerTemplate {
  id: string
  name: string
  shortName: string
  category: GameCategory
  defaultPort: number
  protocol: 'udp' | 'tcp' | 'both'
  steamAppId: number
}

export const GAME_SERVER_TEMPLATES: GameServerTemplate[] = [
  // FPS
  { id: 'csserver', name: 'Counter-Strike 1.6', shortName: 'csserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 10 },
  { id: 'cs2server', name: 'Counter-Strike 2', shortName: 'cs2server', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 730 },
  { id: 'csgoserver', name: 'Counter-Strike: GO', shortName: 'csgoserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 730 },
  { id: 'cssserver', name: 'Counter-Strike: Source', shortName: 'cssserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 240 },
  { id: 'csczserver', name: 'CS: Condition Zero', shortName: 'csczserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 80 },
  { id: 'tf2server', name: 'Team Fortress 2', shortName: 'tf2server', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 440 },
  { id: 'tfcserver', name: 'Team Fortress Classic', shortName: 'tfcserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 20 },
  { id: 'gmodserver', name: "Garry's Mod", shortName: 'gmodserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 4000 },
  { id: 'insserver', name: 'Insurgency', shortName: 'insserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 222880 },
  { id: 'inssserver', name: 'Insurgency: Sandstorm', shortName: 'inssserver', category: 'FPS', defaultPort: 27102, protocol: 'both', steamAppId: 581320 },
  { id: 'l4dserver', name: 'Left 4 Dead', shortName: 'l4dserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 500 },
  { id: 'l4d2server', name: 'Left 4 Dead 2', shortName: 'l4d2server', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 550 },
  { id: 'codserver', name: 'Call of Duty', shortName: 'codserver', category: 'FPS', defaultPort: 28960, protocol: 'udp', steamAppId: 2620 },
  { id: 'cod2server', name: 'Call of Duty 2', shortName: 'cod2server', category: 'FPS', defaultPort: 28960, protocol: 'udp', steamAppId: 2630 },
  { id: 'cod4server', name: 'Call of Duty 4', shortName: 'cod4server', category: 'FPS', defaultPort: 28960, protocol: 'udp', steamAppId: 7940 },
  { id: 'coduoserver', name: 'Call of Duty: United Offensive', shortName: 'coduoserver', category: 'FPS', defaultPort: 28960, protocol: 'udp', steamAppId: 2640 },
  { id: 'codwawserver', name: 'Call of Duty: World at War', shortName: 'codwawserver', category: 'FPS', defaultPort: 28960, protocol: 'udp', steamAppId: 10090 },
  { id: 'kfserver', name: 'Killing Floor', shortName: 'kfserver', category: 'FPS', defaultPort: 7707, protocol: 'udp', steamAppId: 1250 },
  { id: 'kf2server', name: 'Killing Floor 2', shortName: 'kf2server', category: 'FPS', defaultPort: 7777, protocol: 'udp', steamAppId: 232090 },
  { id: 'squadserver', name: 'Squad', shortName: 'squadserver', category: 'FPS', defaultPort: 7787, protocol: 'udp', steamAppId: 393380 },
  { id: 'pstbsserver', name: 'Squad 44', shortName: 'pstbsserver', category: 'FPS', defaultPort: 7787, protocol: 'udp', steamAppId: 736220 },
  { id: 'pvrserver', name: 'Pavlov VR', shortName: 'pvrserver', category: 'FPS', defaultPort: 7777, protocol: 'udp', steamAppId: 555160 },
  { id: 'arma3server', name: 'Arma 3', shortName: 'arma3server', category: 'FPS', defaultPort: 2302, protocol: 'udp', steamAppId: 107410 },
  { id: 'armarserver', name: 'Arma Reforger', shortName: 'armarserver', category: 'FPS', defaultPort: 2001, protocol: 'udp', steamAppId: 1874900 },
  { id: 'bf1942server', name: 'Battlefield 1942', shortName: 'bf1942server', category: 'FPS', defaultPort: 14567, protocol: 'udp', steamAppId: 0 },
  { id: 'bfvserver', name: 'Battlefield: Vietnam', shortName: 'bfvserver', category: 'FPS', defaultPort: 15567, protocol: 'udp', steamAppId: 0 },
  { id: 'dodserver', name: 'Day of Defeat', shortName: 'dodserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 30 },
  { id: 'dodsserver', name: 'Day of Defeat: Source', shortName: 'dodsserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 300 },
  { id: 'doiserver', name: 'Day of Infamy', shortName: 'doiserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 447820 },
  { id: 'dmcserver', name: 'Deathmatch Classic', shortName: 'dmcserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 40 },
  { id: 'fofserver', name: 'Fistful of Frags', shortName: 'fofserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 265630 },
  { id: 'hl2dmserver', name: 'Half-Life 2: Deathmatch', shortName: 'hl2dmserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 320 },
  { id: 'hldmserver', name: 'Half-Life: Deathmatch', shortName: 'hldmserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 70 },
  { id: 'hldmsserver', name: 'HL Deathmatch: Source', shortName: 'hldmsserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 360 },
  { id: 'opforserver', name: 'Opposing Force', shortName: 'opforserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 50 },
  { id: 'ricochetserver', name: 'Ricochet', shortName: 'ricochetserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 60 },
  { id: 'q2server', name: 'Quake 2', shortName: 'q2server', category: 'FPS', defaultPort: 27910, protocol: 'udp', steamAppId: 2320 },
  { id: 'q3server', name: 'Quake 3: Arena', shortName: 'q3server', category: 'FPS', defaultPort: 27960, protocol: 'udp', steamAppId: 2200 },
  { id: 'q4server', name: 'Quake 4', shortName: 'q4server', category: 'FPS', defaultPort: 28004, protocol: 'udp', steamAppId: 2210 },
  { id: 'qlserver', name: 'Quake Live', shortName: 'qlserver', category: 'FPS', defaultPort: 27960, protocol: 'udp', steamAppId: 282440 },
  { id: 'qwserver', name: 'QuakeWorld', shortName: 'qwserver', category: 'FPS', defaultPort: 27500, protocol: 'udp', steamAppId: 0 },
  { id: 'rtcwserver', name: 'Return to Castle Wolfenstein', shortName: 'rtcwserver', category: 'FPS', defaultPort: 27960, protocol: 'udp', steamAppId: 9010 },
  { id: 'etlserver', name: 'ET: Legacy', shortName: 'etlserver', category: 'FPS', defaultPort: 27960, protocol: 'udp', steamAppId: 0 },
  { id: 'wetserver', name: 'Wolfenstein: Enemy Territory', shortName: 'wetserver', category: 'FPS', defaultPort: 27960, protocol: 'udp', steamAppId: 0 },
  { id: 'sof2server', name: 'Soldier of Fortune 2', shortName: 'sof2server', category: 'FPS', defaultPort: 20100, protocol: 'udp', steamAppId: 0 },
  { id: 'utserver', name: 'Unreal Tournament', shortName: 'utserver', category: 'FPS', defaultPort: 7777, protocol: 'udp', steamAppId: 13240 },
  { id: 'ut99server', name: 'Unreal Tournament 99', shortName: 'ut99server', category: 'FPS', defaultPort: 7777, protocol: 'udp', steamAppId: 13240 },
  { id: 'ut2k4server', name: 'Unreal Tournament 2004', shortName: 'ut2k4server', category: 'FPS', defaultPort: 7777, protocol: 'udp', steamAppId: 13230 },
  { id: 'ut3server', name: 'Unreal Tournament 3', shortName: 'ut3server', category: 'FPS', defaultPort: 7777, protocol: 'udp', steamAppId: 13210 },
  { id: 'bmdmserver', name: 'Black Mesa: Deathmatch', shortName: 'bmdmserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 362890 },
  { id: 'ns2server', name: 'Natural Selection 2', shortName: 'ns2server', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 4920 },
  { id: 'nmrihserver', name: 'No More Room in Hell', shortName: 'nmrihserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 224260 },
  { id: 'ndserver', name: 'Nuclear Dawn', shortName: 'ndserver', category: 'FPS', defaultPort: 27015, protocol: 'both', steamAppId: 17710 },
  { id: 'ohdserver', name: 'Operation: Harsh Doorstop', shortName: 'ohdserver', category: 'FPS', defaultPort: 7777, protocol: 'udp', steamAppId: 736590 },
  { id: 'xntserver', name: 'Xonotic', shortName: 'xntserver', category: 'FPS', defaultPort: 26000, protocol: 'udp', steamAppId: 0 },
  { id: 'wfserver', name: 'Warfork', shortName: 'wfserver', category: 'FPS', defaultPort: 44400, protocol: 'udp', steamAppId: 671610 },
  { id: 'solserver', name: 'Soldat', shortName: 'solserver', category: 'FPS', defaultPort: 23073, protocol: 'udp', steamAppId: 638490 },

  // Survival
  { id: 'rustserver', name: 'Rust', shortName: 'rustserver', category: 'Survival', defaultPort: 28015, protocol: 'udp', steamAppId: 252490 },
  { id: 'arkserver', name: 'ARK: Survival Evolved', shortName: 'arkserver', category: 'Survival', defaultPort: 7777, protocol: 'udp', steamAppId: 346110 },
  { id: 'dayzserver', name: 'DayZ', shortName: 'dayzserver', category: 'Survival', defaultPort: 2302, protocol: 'udp', steamAppId: 221100 },
  { id: 'vhserver', name: 'Valheim', shortName: 'vhserver', category: 'Survival', defaultPort: 2456, protocol: 'udp', steamAppId: 892970 },
  { id: 'pzserver', name: 'Project Zomboid', shortName: 'pzserver', category: 'Survival', defaultPort: 16261, protocol: 'udp', steamAppId: 108600 },
  { id: 'sdtdserver', name: '7 Days to Die', shortName: 'sdtdserver', category: 'Survival', defaultPort: 26900, protocol: 'both', steamAppId: 251570 },
  { id: 'dstserver', name: "Don't Starve Together", shortName: 'dstserver', category: 'Survival', defaultPort: 10999, protocol: 'udp', steamAppId: 322330 },
  { id: 'untserver', name: 'Unturned', shortName: 'untserver', category: 'Survival', defaultPort: 27015, protocol: 'udp', steamAppId: 304930 },
  { id: 'ecoserver', name: 'Eco', shortName: 'ecoserver', category: 'Survival', defaultPort: 3000, protocol: 'udp', steamAppId: 382310 },
  { id: 'ckserver', name: 'Core Keeper', shortName: 'ckserver', category: 'Survival', defaultPort: 27015, protocol: 'udp', steamAppId: 1621690 },
  { id: 'hzserver', name: 'Humanitz', shortName: 'hzserver', category: 'Survival', defaultPort: 27015, protocol: 'udp', steamAppId: 1935610 },
  { id: 'pwserver', name: 'Palworld', shortName: 'pwserver', category: 'Survival', defaultPort: 8211, protocol: 'udp', steamAppId: 1623730 },
  { id: 'hwserver', name: 'Hurtworld', shortName: 'hwserver', category: 'Survival', defaultPort: 12871, protocol: 'udp', steamAppId: 393420 },
  { id: 'rwserver', name: 'Rising World', shortName: 'rwserver', category: 'Survival', defaultPort: 4255, protocol: 'both', steamAppId: 324080 },
  { id: 'btserver', name: 'Barotrauma', shortName: 'btserver', category: 'Survival', defaultPort: 27015, protocol: 'udp', steamAppId: 602960 },
  { id: 'avserver', name: 'Avorion', shortName: 'avserver', category: 'Survival', defaultPort: 27000, protocol: 'udp', steamAppId: 445220 },
  { id: 'stnserver', name: 'Stationeers', shortName: 'stnserver', category: 'Survival', defaultPort: 27500, protocol: 'udp', steamAppId: 544550 },
  { id: 'necserver', name: 'Necesse', shortName: 'necserver', category: 'Survival', defaultPort: 14159, protocol: 'udp', steamAppId: 1169040 },
  { id: 'wurmserver', name: 'Wurm Unlimited', shortName: 'wurmserver', category: 'Survival', defaultPort: 3724, protocol: 'tcp', steamAppId: 366220 },
  { id: 'dodrserver', name: 'Day of Dragons', shortName: 'dodrserver', category: 'Survival', defaultPort: 7777, protocol: 'udp', steamAppId: 1088320 },
  { id: 'smserver', name: 'Soulmask', shortName: 'smserver', category: 'Survival', defaultPort: 7777, protocol: 'udp', steamAppId: 2646460 },
  { id: 'tfserver', name: 'The Front', shortName: 'tfserver', category: 'Survival', defaultPort: 7777, protocol: 'udp', steamAppId: 2285150 },
  { id: 'momserver', name: 'Memories of Mars', shortName: 'momserver', category: 'Survival', defaultPort: 7777, protocol: 'udp', steamAppId: 644290 },

  // Sandbox
  { id: 'mcserver', name: 'Minecraft: Java', shortName: 'mcserver', category: 'Sandbox', defaultPort: 25565, protocol: 'tcp', steamAppId: 0 },
  { id: 'mcbserver', name: 'Minecraft: Bedrock', shortName: 'mcbserver', category: 'Sandbox', defaultPort: 19132, protocol: 'udp', steamAppId: 0 },
  { id: 'pmcserver', name: 'PaperMC', shortName: 'pmcserver', category: 'Sandbox', defaultPort: 25565, protocol: 'tcp', steamAppId: 0 },
  { id: 'terrariaserver', name: 'Terraria', shortName: 'terrariaserver', category: 'Sandbox', defaultPort: 7777, protocol: 'tcp', steamAppId: 105600 },
  { id: 'sbserver', name: 'Starbound', shortName: 'sbserver', category: 'Sandbox', defaultPort: 21025, protocol: 'tcp', steamAppId: 211820 },
  { id: 'fctrserver', name: 'Factorio', shortName: 'fctrserver', category: 'Sandbox', defaultPort: 34197, protocol: 'udp', steamAppId: 427520 },
  { id: 'sfserver', name: 'Satisfactory', shortName: 'sfserver', category: 'Sandbox', defaultPort: 7777, protocol: 'udp', steamAppId: 526870 },
  { id: 'vintsserver', name: 'Vintage Story', shortName: 'vintsserver', category: 'Sandbox', defaultPort: 42420, protocol: 'tcp', steamAppId: 0 },
  { id: 'colserver', name: 'Colony Survival', shortName: 'colserver', category: 'Sandbox', defaultPort: 27004, protocol: 'both', steamAppId: 366090 },
  { id: 'craftopia', name: 'Craftopia', shortName: 'craftopia', category: 'Sandbox', defaultPort: 7777, protocol: 'udp', steamAppId: 1307550 },
  { id: 'stserver', name: 'Stationeers', shortName: 'stserver', category: 'Sandbox', defaultPort: 27500, protocol: 'udp', steamAppId: 544550 },
  { id: 'tuserver', name: 'Tower Unite', shortName: 'tuserver', category: 'Sandbox', defaultPort: 27015, protocol: 'udp', steamAppId: 394690 },

  // RPG & Medieval
  { id: 'mhserver', name: 'Mordhau', shortName: 'mhserver', category: 'RPG', defaultPort: 7777, protocol: 'udp', steamAppId: 629760 },
  { id: 'cmwserver', name: 'Chivalry: Medieval Warfare', shortName: 'cmwserver', category: 'RPG', defaultPort: 7777, protocol: 'udp', steamAppId: 219640 },
  { id: 'tiserver', name: 'The Isle', shortName: 'tiserver', category: 'RPG', defaultPort: 7777, protocol: 'udp', steamAppId: 376210 },
  { id: 'vrserver', name: 'V Rising', shortName: 'vrserver', category: 'RPG', defaultPort: 9876, protocol: 'udp', steamAppId: 1604030 },
  { id: 'pvkiiserver', name: 'Pirates, Vikings & Knights II', shortName: 'pvkiiserver', category: 'RPG', defaultPort: 27015, protocol: 'both', steamAppId: 17570 },
  { id: 'bsserver', name: 'Blade Symphony', shortName: 'bsserver', category: 'RPG', defaultPort: 27015, protocol: 'both', steamAppId: 225600 },
  { id: 'hcuserver', name: 'HYPERCHARGE: Unboxed', shortName: 'hcuserver', category: 'RPG', defaultPort: 7777, protocol: 'udp', steamAppId: 523660 },

  // Racing / Simulation
  { id: 'acserver', name: 'Assetto Corsa', shortName: 'acserver', category: 'Racing', defaultPort: 9600, protocol: 'both', steamAppId: 244210 },
  { id: 'pcserver', name: 'Project Cars', shortName: 'pcserver', category: 'Racing', defaultPort: 27015, protocol: 'udp', steamAppId: 234630 },
  { id: 'pc2server', name: 'Project CARS 2', shortName: 'pc2server', category: 'Racing', defaultPort: 27015, protocol: 'udp', steamAppId: 378860 },
  { id: 'atsserver', name: 'American Truck Simulator', shortName: 'atsserver', category: 'Racing', defaultPort: 27015, protocol: 'both', steamAppId: 270880 },
  { id: 'ets2server', name: 'Euro Truck Simulator 2', shortName: 'ets2server', category: 'Racing', defaultPort: 27015, protocol: 'both', steamAppId: 227300 },

  // VoIP
  { id: 'ts3server', name: 'TeamSpeak 3', shortName: 'ts3server', category: 'VoIP', defaultPort: 9987, protocol: 'udp', steamAppId: 0 },
  { id: 'mumbleserver', name: 'Mumble', shortName: 'mumbleserver', category: 'VoIP', defaultPort: 64738, protocol: 'both', steamAppId: 0 },

  // Other / Misc
  { id: 'jk2server', name: 'Jedi Knight II: Jedi Outcast', shortName: 'jk2server', category: 'Inne', defaultPort: 28070, protocol: 'udp', steamAppId: 6030 },
  { id: 'jc2server', name: 'Just Cause 2', shortName: 'jc2server', category: 'Inne', defaultPort: 7777, protocol: 'udp', steamAppId: 8190 },
  { id: 'jc3server', name: 'Just Cause 3', shortName: 'jc3server', category: 'Inne', defaultPort: 7777, protocol: 'udp', steamAppId: 225540 },
  { id: 'mohaaserver', name: 'Medal of Honor: Allied Assault', shortName: 'mohaaserver', category: 'Inne', defaultPort: 12203, protocol: 'udp', steamAppId: 0 },
  { id: 'roserver', name: 'Red Orchestra', shortName: 'roserver', category: 'Inne', defaultPort: 7757, protocol: 'udp', steamAppId: 1200 },
  { id: 'mtaserver', name: 'Multi Theft Auto', shortName: 'mtaserver', category: 'Inne', defaultPort: 22003, protocol: 'udp', steamAppId: 0 },
  { id: 'sampserver', name: 'SA-MP', shortName: 'sampserver', category: 'Inne', defaultPort: 7777, protocol: 'udp', steamAppId: 0 },
  { id: 'onsetserver', name: 'Onset', shortName: 'onsetserver', category: 'Inne', defaultPort: 7777, protocol: 'udp', steamAppId: 1105810 },
  { id: 'iosserver', name: 'IOSoccer', shortName: 'iosserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 673560 },
  { id: 'twserver', name: 'Teeworlds', shortName: 'twserver', category: 'Inne', defaultPort: 8303, protocol: 'udp', steamAppId: 380840 },
  { id: 'scpslserver', name: 'SCP: Secret Laboratory', shortName: 'scpslserver', category: 'Inne', defaultPort: 7777, protocol: 'udp', steamAppId: 700330 },
  { id: 'scpslsmserver', name: 'SCP:SL ServerMod', shortName: 'scpslsmserver', category: 'Inne', defaultPort: 7777, protocol: 'udp', steamAppId: 700330 },

  // Mods / Source Mods
  { id: 'ahlserver', name: 'Action Half-Life', shortName: 'ahlserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 0 },
  { id: 'ahl2server', name: 'Action: Source', shortName: 'ahl2server', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 0 },
  { id: 'bdserver', name: 'Base Defense', shortName: 'bdserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 0 },
  { id: 'btlserver', name: 'BATTALION: Legacy', shortName: 'btlserver', category: 'Inne', defaultPort: 7777, protocol: 'udp', steamAppId: 489940 },
  { id: 'bbserver', name: 'BrainBread', shortName: 'bbserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 0 },
  { id: 'bb2server', name: 'BrainBread 2', shortName: 'bb2server', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 346330 },
  { id: 'boserver', name: 'Ballistic Overkill', shortName: 'boserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 296300 },
  { id: 'ccserver', name: 'Codename CURE', shortName: 'ccserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 355180 },
  { id: 'dabserver', name: 'Double Action: Boogaloo', shortName: 'dabserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 317360 },
  { id: 'dysserver', name: 'Dystopia', shortName: 'dysserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 17580 },
  { id: 'emserver', name: 'Empires Mod', shortName: 'emserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 17740 },
  { id: 'nsserver', name: 'Natural Selection', shortName: 'nsserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 0 },
  { id: 'ns2cserver', name: 'NS2: Combat', shortName: 'ns2cserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 310100 },
  { id: 'sfcserver', name: 'Source Forts Classic', shortName: 'sfcserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 0 },
  { id: 'sbotsserver', name: 'StickyBots', shortName: 'sbotsserver', category: 'Inne', defaultPort: 7777, protocol: 'udp', steamAppId: 0 },
  { id: 'svenserver', name: 'Sven Co-op', shortName: 'svenserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 225840 },
  { id: 'tsserver', name: 'The Specialists', shortName: 'tsserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 0 },
  { id: 'vsserver', name: 'Vampire Slayer', shortName: 'vsserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 0 },
  { id: 'zmrserver', name: 'Zombie Master: Reborn', shortName: 'zmrserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 0 },
  { id: 'zpsserver', name: 'Zombie Panic! Source', shortName: 'zpsserver', category: 'Inne', defaultPort: 27015, protocol: 'both', steamAppId: 17500 },
  { id: 'vpmcserver', name: 'Velocity Proxy', shortName: 'vpmcserver', category: 'Inne', defaultPort: 25577, protocol: 'tcp', steamAppId: 0 },
  { id: 'wmcserver', name: 'WaterfallMC', shortName: 'wmcserver', category: 'Inne', defaultPort: 25577, protocol: 'tcp', steamAppId: 0 },
]

// ── Install status helpers ───────────────────────────────────────────────────

export interface InstallStatus {
  status: 'running' | 'success' | 'failed'
  step: string
  log: string[]
  startedAt: string
  completedAt?: string
}

function statusFile(shortName: string): string {
  return `${INSTALL_STATUS_DIR}/gameserver-install-${shortName.replace(/[^a-z0-9]/g, '')}.json`
}

async function writeInstallStatus(shortName: string, data: InstallStatus): Promise<void> {
  await writeFile(statusFile(shortName), JSON.stringify(data, null, 2), 'utf-8')
}

export async function readInstallStatus(shortName: string): Promise<InstallStatus | null> {
  const f = statusFile(shortName)
  if (!existsSync(f)) return null
  try {
    return JSON.parse(await readFile(f, 'utf-8'))
  } catch {
    return null
  }
}

// ── Long-running shell command ───────────────────────────────────────────────

async function runLong(command: string, timeout = 600_000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(command, { timeout })
  } catch (err: any) {
    const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n')
    throw new Error(`Command failed: ${command}\n${details}`)
  }
}

// ── Ensure gsm user exists ───────────────────────────────────────────────────

async function ensureGsmUser(): Promise<void> {
  try {
    await run(`id ${GSM_USER}`)
  } catch {
    await run(`useradd -m -s /bin/bash ${GSM_USER}`)
  }
}

// ── Service functions ────────────────────────────────────────────────────────

export interface GameInstallOptions {
  shortName: string
  serverName?: string
  domain?: string       // subdomain for DNS (e.g. mc.overmedia.pl)
  port?: number
  maxPlayers?: number
  password?: string
  cfToken?: string      // Cloudflare API token for DNS
}

export async function installGameServer(options: GameInstallOptions): Promise<void> {
  const { shortName, serverName, domain, port, maxPlayers, password, cfToken } = options
  const template = GAME_SERVER_TEMPLATES.find(t => t.shortName === shortName)
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  const gamePort = port ?? template?.defaultPort ?? 27015
  const log: string[] = []
  const startedAt = new Date().toISOString()

  async function logStep(step: string, fn: () => Promise<void>): Promise<void> {
    log.push(`> ${step}`)
    await writeInstallStatus(shortName, { status: 'running', step, log, startedAt })
    try {
      await fn()
      log.push(`✓ ${step}`)
      await writeInstallStatus(shortName, { status: 'running', step, log, startedAt })
    } catch (err: any) {
      const msg = err.message || String(err)
      const lines = msg.split('\n').filter((l: string) => l.trim())
      for (const line of lines.slice(0, 10)) {
        log.push(`  ${line}`)
      }
      log.push(`✗ ${step}`)
      await writeInstallStatus(shortName, { status: 'failed', step, log, startedAt, completedAt: new Date().toISOString() })
      throw err
    }
  }

  // 1. Ensure gsm user
  await logStep('Tworzenie użytkownika systemowego', async () => {
    await ensureGsmUser()
  })

  // 2. Install system dependencies (Java, SteamCMD, libs)
  await logStep('Instalacja zależności systemowych', async () => {
    // Core deps for all game servers
    await runLong(`dpkg --add-architecture i386 2>/dev/null || true`)
    await runLong(`apt-get update -qq 2>/dev/null`)
    await runLong(`DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl wget tar bzip2 gzip unzip bsdmainutils python3 util-linux ca-certificates binutils bc jq tmux netcat-openbsd lib32gcc-s1 lib32stdc++6 libsdl2-2.0-0:i386 2>/dev/null || true`, 120_000)

    // Java for Minecraft-based servers
    const javaServers = ['mcserver', 'mcbserver', 'pmcserver', 'vpmcserver', 'wmcserver']
    if (javaServers.includes(safe)) {
      await runLong(`DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openjdk-21-jre 2>/dev/null || true`, 120_000)
    }

    // SteamCMD for Source/Valve games
    const steamServers = ['csserver', 'cs2server', 'csgoserver', 'cssserver', 'csczserver', 'tf2server', 'tfcserver', 'gmodserver', 'l4dserver', 'l4d2server', 'insserver', 'inssserver', 'dodserver', 'dodsserver', 'hl2dmserver', 'hldmserver', 'hldmsserver', 'dmcserver', 'opforserver', 'ricochetserver', 'bmdmserver', 'rustserver', 'arkserver', 'dayzserver', 'vhserver', 'sdtdserver', 'untserver', 'kf2server', 'squadserver', 'pstbsserver', 'ns2server']
    if (steamServers.includes(safe)) {
      await runLong(`echo steam steam/question select "I AGREE" | debconf-set-selections 2>/dev/null; echo steam steam/license note '' | debconf-set-selections 2>/dev/null; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq steamcmd 2>/dev/null || true`, 120_000)
    }
  })

  // 3. Create install directory
  await logStep('Tworzenie katalogu instalacji', async () => {
    await run(`rm -rf ${installDir}`)
    await run(`mkdir -p ${installDir}`)
    await run(`chown ${GSM_USER}:${GSM_USER} ${installDir}`)
  })

  // 4. Download LinuxGSM
  await logStep('Pobieranie LinuxGSM', async () => {
    await runLong(`su - ${GSM_USER} -c "cd ${installDir} && curl -Lo linuxgsm.sh https://linuxgsm.sh && chmod +x linuxgsm.sh"`)
  })

  // 5. Setup game server via LinuxGSM
  await logStep(`Konfiguracja serwera: ${safe}`, async () => {
    await runLong(`su - ${GSM_USER} -c "cd ${installDir} && bash linuxgsm.sh ${safe}"`, 120_000)
  })

  // 6. Run server install (downloads game files — can be very slow)
  await logStep('Pobieranie plików gry (to może potrwać kilka minut...)', async () => {
    await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} auto-install"`, 1800_000) // 30 min timeout
  })

  // 6. Open port in UFW firewall
  await logStep(`Otwieranie portu ${gamePort} w firewall`, async () => {
    const proto = template?.protocol ?? 'both'
    if (proto === 'tcp') {
      await run(`ufw allow ${gamePort}/tcp 2>/dev/null || true`)
    } else if (proto === 'udp') {
      await run(`ufw allow ${gamePort}/udp 2>/dev/null || true`)
    } else {
      await run(`ufw allow ${gamePort} 2>/dev/null || true`)
    }
  })

  // 7. Auto DNS record (Cloudflare, szara chmurka — DNS only, bez proxy)
  if (domain && cfToken) {
    await logStep(`Tworzenie rekordu DNS: ${domain}`, async () => {
      try {
        const { findZoneForDomain, createDnsRecord, getPublicIp } = await import('./cloudflare.js')
        const zone = await findZoneForDomain(cfToken, domain)
        if (zone) {
          const ip = await getPublicIp()
          await createDnsRecord(cfToken, zone.id, {
            type: 'A',
            name: domain,
            content: ip,
            ttl: 1,
            proxied: false, // szara chmurka — gracze łączą się bezpośrednio
          })
        }
      } catch (dnsErr: any) {
        log.push(`  DNS warning: ${dnsErr.message}`)
      }
    })
  }

  // 8. Save config
  await logStep('Zapisywanie konfiguracji', async () => {
    const config = JSON.stringify({
      shortName, serverName: serverName ?? template?.name ?? shortName,
      domain: domain ?? null, port: gamePort, maxPlayers: maxPlayers ?? null,
      password: password ?? null, installedAt: new Date().toISOString(),
    }, null, 2)
    await writeFile(`${installDir}/overpanel-config.json`, config, 'utf-8')
  })

  // 9. Auto-start server
  await logStep('Uruchamianie serwera', async () => {
    await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} start"`, 120_000)
  })

  log.push('✓ Instalacja serwera gry zakończona pomyślnie!')
  if (domain) log.push(`  Adres: ${domain}:${gamePort}`)
  else log.push(`  Adres: <IP_SERWERA>:${gamePort}`)
  await writeInstallStatus(shortName, { status: 'success', step: 'done', log, startedAt, completedAt: new Date().toISOString() })
}

export async function startGameServer(shortName: string): Promise<void> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} start"`, 120_000)
}

export async function stopGameServer(shortName: string): Promise<void> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} stop"`, 120_000)
}

export async function restartGameServer(shortName: string): Promise<void> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} restart"`, 120_000)
}

export async function getGameServerStatus(shortName: string): Promise<{ running: boolean; pid?: number }> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`
  try {
    const { stdout } = await runLong(`su - ${GSM_USER} -c "cd ${installDir} && ./${safe} details" 2>&1 || true`, 30_000)
    // LinuxGSM details output includes "Status: STARTED" or "Status: STOPPED"
    const running = /Status:\s+STARTED/i.test(stdout) || /is already running/i.test(stdout)
    const pidMatch = stdout.match(/PID:\s+(\d+)/i)
    return { running, pid: pidMatch ? parseInt(pidMatch[1], 10) : undefined }
  } catch {
    return { running: false }
  }
}

export interface InstalledServerInfo {
  shortName: string
  serverName: string
  domain: string | null
  port: number
  maxPlayers: number | null
  password: string | null
}

export async function getInstalledServers(): Promise<InstalledServerInfo[]> {
  try {
    const entries = await readdir(GAME_SERVERS_BASE)
    const installed: InstalledServerInfo[] = []
    for (const entry of entries) {
      if (!existsSync(`${GAME_SERVERS_BASE}/${entry}/linuxgsm.sh`)) continue
      const configPath = `${GAME_SERVERS_BASE}/${entry}/overpanel-config.json`
      let config: any = {}
      try {
        config = JSON.parse(await readFile(configPath, 'utf-8'))
      } catch {}
      const template = GAME_SERVER_TEMPLATES.find(t => t.shortName === entry)
      installed.push({
        shortName: entry,
        serverName: config.serverName ?? template?.name ?? entry,
        domain: config.domain ?? null,
        port: config.port ?? template?.defaultPort ?? 27015,
        maxPlayers: config.maxPlayers ?? null,
        password: config.password ?? null,
      })
    }
    return installed
  } catch {
    return []
  }
}

export async function uninstallGameServer(shortName: string): Promise<void> {
  const safe = shortName.replace(/[^a-z0-9]/g, '')
  const installDir = `${GAME_SERVERS_BASE}/${safe}`

  // Try to stop first
  try {
    await stopGameServer(shortName)
  } catch {
    // Ignore — server might not be running
  }

  // Remove directory
  await rm(installDir, { recursive: true, force: true })
}
