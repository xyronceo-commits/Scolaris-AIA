/**
 * Comprehensive, officially recognised universities in Nigeria.
 * Categorised into Federal, State, and Private universities across all 36 States and the FCT.
 * Organised alphabetically with official names, acronyms/aliases, ownership type, and state.
 */

export type UniversityType = 'Federal' | 'State' | 'Private';

export interface NigerianUniversity {
  name: string;
  acronym?: string;
  type: UniversityType;
  state: string;
}

const RAW_NIGERIAN_UNIVERSITIES: NigerianUniversity[] = [
  // A
  { name: 'Abia State University, Uturu', acronym: 'ABSU', type: 'State', state: 'Abia' },
  { name: 'Abubakar Tafawa Balewa University, Bauchi', acronym: 'ATBU', type: 'Federal', state: 'Bauchi' },
  { name: 'Achievers University, Owo', acronym: 'AC', type: 'Private', state: 'Ondo' },
  { name: 'Adamawa State University, Mubi', acronym: 'ADSU', type: 'State', state: 'Adamawa' },
  { name: 'Adekunle Ajasin University, Akungba-Akoko', acronym: 'AAUA', type: 'State', state: 'Ondo' },
  { name: 'Adeleke University, Ede', acronym: 'AUE', type: 'Private', state: 'Osun' },
  { name: 'Admiralty University of Nigeria, Ibusa', acronym: 'ADUN', type: 'Federal', state: 'Delta' },
  { name: 'Afe Babalola University, Ado-Ekiti', acronym: 'ABUAD', type: 'Private', state: 'Ekiti' },
  { name: 'African University of Science and Technology, Abuja', acronym: 'AUST', type: 'Private', state: 'FCT' },
  { name: 'Ahmadu Bello University, Zaria', acronym: 'ABU', type: 'Federal', state: 'Kaduna' },
  { name: 'Ahman Pategi University, Patigi', acronym: 'APU', type: 'Private', state: 'Kwara' },
  { name: 'Air Force Institute of Technology, Kaduna', acronym: 'AFIT', type: 'Federal', state: 'Kaduna' },
  { name: 'Ajayi Crowther University, Oyo', acronym: 'ACU', type: 'Private', state: 'Oyo' },
  { name: 'Akwa Ibom State University, Ikot Akpaden', acronym: 'AKSU', type: 'State', state: 'Akwa Ibom' },
  { name: 'Alex Ekwueme Federal University, Ndufu-Alike', acronym: 'AE-FUNAI', type: 'Federal', state: 'Ebonyi' },
  { name: 'Al-Hikmah University, Ilorin', acronym: 'AHU', type: 'Private', state: 'Kwara' },
  { name: 'Al-Qalam University, Katsina', acronym: 'AUK', type: 'Private', state: 'Katsina' },
  { name: 'Amadeus University, Amizi', acronym: 'AUA', type: 'Private', state: 'Abia' },
  { name: 'Ambrose Alli University, Ekpoma', acronym: 'AAU', type: 'State', state: 'Edo' },
  { name: 'American University of Nigeria, Yola', acronym: 'AUN', type: 'Private', state: 'Adamawa' },
  { name: 'Anchor University, Ayobo', acronym: 'AUL', type: 'Private', state: 'Lagos' },
  { name: 'Arthur Jarvis University, Akpabuyo', acronym: 'AJU', type: 'Private', state: 'Cross River' },
  { name: 'Atiba University, Oyo', acronym: 'AUO', type: 'Private', state: 'Oyo' },
  { name: 'Augustine University, Ilara-Epe', acronym: 'AUI', type: 'Private', state: 'Lagos' },
  { name: 'Ave Maria University, Piyanko', acronym: 'AMU', type: 'Private', state: 'Nasarawa' },

  // B
  { name: 'Baba-Ahmed University, Kano', acronym: 'BAUK', type: 'Private', state: 'Kano' },
  { name: 'Babcock University, Ilishan-Remo', acronym: 'BU', type: 'Private', state: 'Ogun' },
  { name: 'Bamidele Olumilua University of Education, Science and Technology, Ikere-Ekiti', acronym: 'BOUESTI', type: 'State', state: 'Ekiti' },
  { name: 'Bauchi State University, Gadau (Sa\'adu Zungur University)', acronym: 'BASUG', type: 'State', state: 'Bauchi' },
  { name: 'Bayelsa Medical University, Yenagoa', acronym: 'BMU', type: 'State', state: 'Bayelsa' },
  { name: 'Bayero University, Kano', acronym: 'BUK', type: 'Federal', state: 'Kano' },
  { name: 'Baze University, Abuja', acronym: 'BAZE', type: 'Private', state: 'FCT' },
  { name: 'Bells University of Technology, Ota', acronym: 'BELLSTECH', type: 'Private', state: 'Ogun' },
  { name: 'Benson Idahosa University, Benin City', acronym: 'BIU', type: 'Private', state: 'Edo' },
  { name: 'Benue State University, Makurdi', acronym: 'BSUM', type: 'State', state: 'Benue' },
  { name: 'Bingham University, Karu', acronym: 'BHU', type: 'Private', state: 'Nasarawa' },
  { name: 'Borno State University, Maiduguri', acronym: 'BOSU', type: 'State', state: 'Borno' },
  { name: 'Bowen University, Iwo', acronym: 'BUI', type: 'Private', state: 'Osun' },

  // C
  { name: 'Caleb University, Imota', acronym: 'CUL', type: 'Private', state: 'Lagos' },
  { name: 'Canadian University of Nigeria, Abuja', acronym: 'CUN', type: 'Private', state: 'FCT' },
  { name: 'Capital City University, Kano', acronym: 'CCUK', type: 'Private', state: 'Kano' },
  { name: 'Caritas University, Amorji-Nike', acronym: 'CAU', type: 'Private', state: 'Enugu' },
  { name: 'Chrisland University, Abeokuta', acronym: 'CLU', type: 'Private', state: 'Ogun' },
  { name: 'Christopher University, Mowe', acronym: 'UNICHRIS', type: 'Private', state: 'Ogun' },
  { name: 'Chukwuemeka Odumegwu Ojukwu University, Uli', acronym: 'COOU', type: 'State', state: 'Anambra' },
  { name: 'Claretian University of Nigeria, Nekede', acronym: 'CUN', type: 'Private', state: 'Imo' },
  { name: 'Clifford University, Owerrinta', acronym: 'CLU', type: 'Private', state: 'Abia' },
  { name: 'Coal City University, Enugu', acronym: 'CCU', type: 'Private', state: 'Enugu' },
  { name: 'Confluence University of Science and Technology, Osara', acronym: 'CUSTECH', type: 'State', state: 'Kogi' },
  { name: 'Covenant University, Ota', acronym: 'CU', type: 'Private', state: 'Ogun' },
  { name: 'Crawford University, Igbesa', acronym: 'CRU', type: 'Private', state: 'Ogun' },
  { name: 'Crescent University, Abeokuta', acronym: 'CUAB', type: 'Private', state: 'Ogun' },
  { name: 'Crown Hill University, Eiyenkorin', acronym: 'CHU', type: 'Private', state: 'Kwara' },

  // D
  { name: 'David Nweze Umahi Federal University of Medical Sciences, Uburu', acronym: 'KDUMS', type: 'Federal', state: 'Ebonyi' },
  { name: 'Delta State University, Abraka', acronym: 'DELSU', type: 'State', state: 'Delta' },
  { name: 'Delta University of Science and Technology, Ozoro', acronym: 'DUST', type: 'State', state: 'Delta' },
  { name: 'Dennis Osadebay University, Asaba', acronym: 'DOU', type: 'State', state: 'Delta' },
  { name: 'Dominican University, Ibadan', acronym: 'DUI', type: 'Private', state: 'Oyo' },
  { name: 'Dominion University, Ibadan', acronym: 'DU', type: 'Private', state: 'Oyo' },

  // E
  { name: 'Ebonyi State University, Abakaliki', acronym: 'EBSU', type: 'State', state: 'Ebonyi' },
  { name: 'Edo State University, Uzairue', acronym: 'EDSU', type: 'State', state: 'Edo' },
  { name: 'Edusoko University, Bida', acronym: 'EU', type: 'Private', state: 'Niger' },
  { name: 'Edwin Clark University, Kiagbodo', acronym: 'ECU', type: 'Private', state: 'Delta' },
  { name: 'Ekiti State University, Ado-Ekiti', acronym: 'EKSU', type: 'State', state: 'Ekiti' },
  { name: 'Eko University of Medicine and Health Sciences, Ijanikin', acronym: 'EKOUNIMED', type: 'Private', state: 'Lagos' },
  { name: 'Elizade University, Ilara-Mokin', acronym: 'EU', type: 'Private', state: 'Ondo' },
  { name: 'Enugu State University of Science and Technology, Agbani', acronym: 'ESUT', type: 'State', state: 'Enugu' },

  // F
  { name: 'Federal University of Agriculture, Abeokuta', acronym: 'FUNAAB', type: 'Federal', state: 'Ogun' },
  { name: 'Federal University of Agriculture, Zuru', acronym: 'FUAZ', type: 'Federal', state: 'Kebbi' },
  { name: 'Federal University of Allied Health Sciences, Enugu', acronym: 'FUAHS', type: 'Federal', state: 'Enugu' },
  { name: 'Federal University of Health Sciences, Azare', acronym: 'FUHSA', type: 'Federal', state: 'Bauchi' },
  { name: 'Federal University of Health Sciences, Ila-Orangun', acronym: 'FUHSI', type: 'Federal', state: 'Osun' },
  { name: 'Federal University of Health Sciences, Otukpo', acronym: 'FUHSO', type: 'Federal', state: 'Benue' },
  { name: 'Federal University of Petroleum Resources, Effurun', acronym: 'FUPRE', type: 'Federal', state: 'Delta' },
  { name: 'Federal University of Technology, Akure', acronym: 'FUTA', type: 'Federal', state: 'Ondo' },
  { name: 'Federal University of Technology, Babura', acronym: 'FUTB', type: 'Federal', state: 'Jigawa' },
  { name: 'Federal University of Technology, Ikot Abasi', acronym: 'FUTIA', type: 'Federal', state: 'Akwa Ibom' },
  { name: 'Federal University of Technology, Minna', acronym: 'FUTMINNA', type: 'Federal', state: 'Niger' },
  { name: 'Federal University of Technology, Owerri', acronym: 'FUTO', type: 'Federal', state: 'Imo' },
  { name: 'Federal University, Birnin Kebbi', acronym: 'FUBK', type: 'Federal', state: 'Kebbi' },
  { name: 'Federal University, Dutse', acronym: 'FUD', type: 'Federal', state: 'Jigawa' },
  { name: 'Federal University, Dutsin-Ma', acronym: 'FUDMA', type: 'Federal', state: 'Katsina' },
  { name: 'Federal University, Gashua', acronym: 'FUGA', type: 'Federal', state: 'Yobe' },
  { name: 'Federal University, Gusau', acronym: 'FUGUS', type: 'Federal', state: 'Zamfara' },
  { name: 'Federal University, Kashere', acronym: 'FUKASHERE', type: 'Federal', state: 'Gombe' },
  { name: 'Federal University, Lafia', acronym: 'FULAFIA', type: 'Federal', state: 'Nasarawa' },
  { name: 'Federal University, Lokoja', acronym: 'FULOKOJA', type: 'Federal', state: 'Kogi' },
  { name: 'Federal University, Otuoke', acronym: 'FUOTUOKE', type: 'Federal', state: 'Bayelsa' },
  { name: 'Federal University, Oye-Ekiti', acronym: 'FUOYE', type: 'Federal', state: 'Ekiti' },
  { name: 'Federal University, Wukari', acronym: 'FUWUKARI', type: 'Federal', state: 'Taraba' },
  { name: 'Fountain University, Osogbo', acronym: 'FUO', type: 'Private', state: 'Osun' },
  { name: 'Franco-British International University, Kaduna', acronym: 'FBIU', type: 'Private', state: 'Kaduna' },

  // G
  { name: 'Gerar University of Medical Sciences, Imope-Ijebu', acronym: 'GUMED', type: 'Private', state: 'Ogun' },
  { name: 'Godfrey Okoye University, Ugwuomu-Nike', acronym: 'GOUNI', type: 'Private', state: 'Enugu' },
  { name: 'Gombe State University, Tudun Wada', acronym: 'GSU', type: 'State', state: 'Gombe' },
  { name: 'Greenfield University, Kaduna', acronym: 'GFU', type: 'Private', state: 'Kaduna' },
  { name: 'Gregory University, Uturu', acronym: 'GUU', type: 'Private', state: 'Abia' },

  // H
  { name: 'Hallmark University, Ijebu-Itele', acronym: 'HU', type: 'Private', state: 'Ogun' },
  { name: 'Havilla University, Nde-Ikom', acronym: 'HUNI', type: 'Private', state: 'Cross River' },
  { name: 'Huda University, Gusau', acronym: 'HUG', type: 'Private', state: 'Zamfara' },

  // I
  { name: 'Ibrahim Badamasi Babangida University, Lapai', acronym: 'IBBU', type: 'State', state: 'Niger' },
  { name: 'Igbinedion University, Okada', acronym: 'IUO', type: 'Private', state: 'Edo' },
  { name: 'Ignatius Ajuru University of Education, Rumuolumeni', acronym: 'IAUE', type: 'State', state: 'Rivers' },
  { name: 'Imo State University, Owerri', acronym: 'IMSU', type: 'State', state: 'Imo' },

  // J
  { name: 'Joseph Ayo Babalola University, Ikeji-Arakeji', acronym: 'JABU', type: 'Private', state: 'Osun' },
  { name: 'Joseph Sarwuan Tarka University, Makurdi', acronym: 'JOSTUM', type: 'Federal', state: 'Benue' },

  // K
  { name: 'Kaduna State University, Kaduna', acronym: 'KASU', type: 'State', state: 'Kaduna' },
  { name: 'Kano University of Science and Technology, Wudil (Aliko Dangote University)', acronym: 'ADUSTECH', type: 'State', state: 'Kano' },
  { name: 'Karl Kumm University, Vom', acronym: 'KKU', type: 'Private', state: 'Plateau' },
  { name: 'Kebbi State University of Science and Technology, Aliero', acronym: 'KSUSTA', type: 'State', state: 'Kebbi' },
  { name: 'Khadija University, Majia', acronym: 'KUM', type: 'Private', state: 'Jigawa' },
  { name: 'Kings University, Ode-Omu', acronym: 'KU', type: 'Private', state: 'Osun' },
  { name: 'Kogi State University, Anyigba (Prince Abubakar Audu University)', acronym: 'PAAU', type: 'State', state: 'Kogi' },
  { name: 'Kogi State University, Kabba', acronym: 'KSUK', type: 'State', state: 'Kogi' },
  { name: 'Kola Daisi University, Ibadan', acronym: 'KDU', type: 'Private', state: 'Oyo' },
  { name: 'Kwara State University, Malete', acronym: 'KWASU', type: 'State', state: 'Kwara' },
  { name: 'Kwararafa University, Wukari', acronym: 'KUW', type: 'Private', state: 'Taraba' },

  // L
  { name: 'Ladoke Akintola University of Technology, Ogbomoso', acronym: 'LAUTECH', type: 'State', state: 'Oyo' },
  { name: 'Lagos State University of Education, Oto/Ijanikin', acronym: 'LASUED', type: 'State', state: 'Lagos' },
  { name: 'Lagos State University of Science and Technology, Ikorodu', acronym: 'LASUSTECH', type: 'State', state: 'Lagos' },
  { name: 'Lagos State University, Ojo', acronym: 'LASU', type: 'State', state: 'Lagos' },
  { name: 'Landmark University, Omu-Aran', acronym: 'LMU', type: 'Private', state: 'Kwara' },
  { name: 'Lead City University, Ibadan', acronym: 'LCU', type: 'Private', state: 'Oyo' },

  // M
  { name: 'Madonna University, Elele', acronym: 'MU', type: 'Private', state: 'Rivers' },
  { name: 'Margaret Lawrence University, Galilee', acronym: 'MLU', type: 'Private', state: 'Delta' },
  { name: 'Maryam Abacha American University of Nigeria, Kano', acronym: 'MAAUN', type: 'Private', state: 'Kano' },
  { name: 'McPherson University, Seriki Sotayo', acronym: 'McU', type: 'Private', state: 'Ogun' },
  { name: 'Mewar International University, Masaka', acronym: 'MIU', type: 'Private', state: 'Nasarawa' },
  { name: 'Michael Okpara University of Agriculture, Umudike', acronym: 'MOUAU', type: 'Federal', state: 'Abia' },
  { name: 'Modibbo Adama University, Yola', acronym: 'MAU', type: 'Federal', state: 'Adamawa' },
  { name: 'Mountain Top University, Makogi Oba', acronym: 'MTU', type: 'Private', state: 'Ogun' },
  { name: 'Mudiame University, Irrua', acronym: 'MU', type: 'Private', state: 'Edo' },

  // N
  { name: 'Nasarawa State University, Keffi', acronym: 'NSUK', type: 'State', state: 'Nasarawa' },
  { name: 'National Open University of Nigeria', acronym: 'NOUN', type: 'Federal', state: 'FCT' },
  { name: 'Niger Delta University, Wilberforce Island', acronym: 'NDU', type: 'State', state: 'Bayelsa' },
  { name: 'Nigeria Police Academy, Wudil', acronym: 'POLAC', type: 'Federal', state: 'Kano' },
  { name: 'Nigerian Army University, Biu', acronym: 'NAUB', type: 'Federal', state: 'Borno' },
  { name: 'Nigerian Defence Academy, Kaduna', acronym: 'NDA', type: 'Federal', state: 'Kaduna' },
  { name: 'Nigerian Maritime University, Okerenkoko', acronym: 'NMU', type: 'Federal', state: 'Delta' },
  { name: 'Nile University of Nigeria, Abuja', acronym: 'NILE', type: 'Private', state: 'FCT' },
  { name: 'Nnamdi Azikiwe University, Awka', acronym: 'UNIZIK', type: 'Federal', state: 'Anambra' },
  { name: 'Novena University, Ogume', acronym: 'NOV', type: 'Private', state: 'Delta' },

  // O
  { name: 'Obafemi Awolowo University, Ile-Ife', acronym: 'OAU', type: 'Federal', state: 'Osun' },
  { name: 'Olabisi Onabanjo University, Ago-Iwoye', acronym: 'OOU', type: 'State', state: 'Ogun' },
  { name: 'Olusegun Agagu University of Science and Technology, Okitipupa', acronym: 'OAUSTECH', type: 'State', state: 'Ondo' },
  { name: 'Osun State University, Osogbo', acronym: 'UNIOSUN', type: 'State', state: 'Osun' },

  // P
  { name: 'PAMO University of Medical Sciences, Port Harcourt', acronym: 'PUMS', type: 'Private', state: 'Rivers' },
  { name: 'Pan-Atlantic University, Lagos', acronym: 'PAU', type: 'Private', state: 'Lagos' },
  { name: 'Paul University, Awka', acronym: 'PUA', type: 'Private', state: 'Anambra' },
  { name: 'Peace Institute University, Funtua', acronym: 'PIU', type: 'Private', state: 'Katsina' },
  { name: 'Pen Resource University, Gombe', acronym: 'PRU', type: 'Private', state: 'Gombe' },
  { name: 'Philomath University, Kuje', acronym: 'PU', type: 'Private', state: 'FCT' },
  { name: 'Plateau State University, Bokkos', acronym: 'PLASU', type: 'State', state: 'Plateau' },
  { name: 'Precious Cornerstone University, Ibadan', acronym: 'PCU', type: 'Private', state: 'Oyo' },

  // R
  { name: 'Rayhaan University, Kebbi', acronym: 'RUK', type: 'Private', state: 'Kebbi' },
  { name: 'Redeemer\'s University, Ede', acronym: 'RUN', type: 'Private', state: 'Osun' },
  { name: 'Renaissance University, Ugbawka', acronym: 'RNU', type: 'Private', state: 'Enugu' },
  { name: 'Rhema University, Obeama-Asa', acronym: 'RU', type: 'Private', state: 'Abia' },
  { name: 'Rivers State University, Port Harcourt', acronym: 'RSU', type: 'State', state: 'Rivers' },

  // S
  { name: 'Saisa University of Medical Sciences and Technology, Sokoto', acronym: 'SAISA', type: 'Private', state: 'Sokoto' },
  { name: 'Salem University, Lokoja', acronym: 'SU', type: 'Private', state: 'Kogi' },
  { name: 'Sam Maris University, Supare-Akoko', acronym: 'SMU', type: 'Private', state: 'Ondo' },
  { name: 'Shehu Shagari University of Education, Sokoto', acronym: 'SSUES', type: 'State', state: 'Sokoto' },
  { name: 'Skyline University Nigeria, Kano', acronym: 'SUN', type: 'Private', state: 'Kano' },
  { name: 'Southwestern University, Okun-Owa', acronym: 'SWU', type: 'Private', state: 'Ogun' },
  { name: 'Spiritan University, Nneochi', acronym: 'SUN', type: 'Private', state: 'Abia' },
  { name: 'Sports University, Idumuje-Ugboko', acronym: 'SUI', type: 'Private', state: 'Delta' },
  { name: 'Sule Lamido University, Kafin Hausa', acronym: 'SLU', type: 'State', state: 'Jigawa' },
  { name: 'Summit University, Offa', acronym: 'SUN', type: 'Private', state: 'Kwara' },

  // T
  { name: 'Tai Solarin University of Education, Ijagun', acronym: 'TASUED', type: 'State', state: 'Ogun' },
  { name: 'Tansian University, Umunya', acronym: 'TANU', type: 'Private', state: 'Anambra' },
  { name: 'Taraba State University, Jalingo', acronym: 'TASU', type: 'State', state: 'Taraba' },
  { name: 'Thomas Adewumi University, Oko-Irese', acronym: 'TAU', type: 'Private', state: 'Kwara' },
  { name: 'Topfaith University, Mkpatak', acronym: 'TU', type: 'Private', state: 'Akwa Ibom' },
  { name: 'Trinity University, Yaba', acronym: 'TUY', type: 'Private', state: 'Lagos' },

  // U
  { name: 'Umaru Musa Yar\'adua University, Katsina', acronym: 'UMYU', type: 'State', state: 'Katsina' },
  { name: 'University of Abuja, Gwagwalada', acronym: 'UNIABUJA', type: 'Federal', state: 'FCT' },
  { name: 'University of Agriculture and Environmental Sciences, Umuagwo', acronym: 'UAES', type: 'State', state: 'Imo' },
  { name: 'University of Benin, Benin City', acronym: 'UNIBEN', type: 'Federal', state: 'Edo' },
  { name: 'University of Calabar', acronym: 'UNICAL', type: 'Federal', state: 'Cross River' },
  { name: 'University of Cross River State, Calabar', acronym: 'UNICROSS', type: 'State', state: 'Cross River' },
  { name: 'University of Delta, Agbor', acronym: 'UNIDEL', type: 'State', state: 'Delta' },
  { name: 'University of Ibadan', acronym: 'UI', type: 'Federal', state: 'Oyo' },
  { name: 'University of Ilesa', acronym: 'UNILESA', type: 'State', state: 'Osun' },
  { name: 'University of Ilorin', acronym: 'UNILORIN', type: 'Federal', state: 'Kwara' },
  { name: 'University of Jos', acronym: 'UNIJOS', type: 'Federal', state: 'Plateau' },
  { name: 'University of Lagos', acronym: 'UNILAG', type: 'Federal', state: 'Lagos' },
  { name: 'University of Maiduguri', acronym: 'UNIMAID', type: 'Federal', state: 'Borno' },
  { name: 'University of Nigeria, Nsukka', acronym: 'UNN', type: 'Federal', state: 'Enugu' },
  { name: 'University of Port Harcourt', acronym: 'UNIPORT', type: 'Federal', state: 'Rivers' },
  { name: 'University of Uyo', acronym: 'UNIUYO', type: 'Federal', state: 'Akwa Ibom' },
  { name: 'Usmanu Danfodiyo University, Sokoto', acronym: 'UDUS', type: 'Federal', state: 'Sokoto' },

  // V
  { name: 'Venite University, Iloro-Ekiti', acronym: 'VU', type: 'Private', state: 'Ekiti' },
  { name: 'Veritas University, Abuja', acronym: 'VERITAS', type: 'Private', state: 'FCT' },
  { name: 'Vision University, Ikogbo', acronym: 'VU', type: 'Private', state: 'Ogun' },

  // W
  { name: 'Wellspring University, Benin City', acronym: 'WU', type: 'Private', state: 'Edo' },
  { name: 'Wesley University, Ondo', acronym: 'WUO', type: 'Private', state: 'Ondo' },
  { name: 'Western Delta University, Oghara', acronym: 'WDU', type: 'Private', state: 'Delta' },
  { name: 'Westland University, Iwo', acronym: 'WU', type: 'Private', state: 'Osun' },
  { name: 'Wigwe University, Isiokpo', acronym: 'WU', type: 'Private', state: 'Rivers' },

  // Y
  { name: 'Yobe State University, Damaturu', acronym: 'YSU', type: 'State', state: 'Yobe' },
  { name: 'Yusuf Maitama Sule University, Kano', acronym: 'YUMSUK', type: 'State', state: 'Kano' },

  // Z
  { name: 'Zamfara State University, Talata Mafara', acronym: 'ZAMSUT', type: 'State', state: 'Zamfara' }
];

export const NIGERIAN_UNIVERSITIES: NigerianUniversity[] = [...RAW_NIGERIAN_UNIVERSITIES].sort((a, b) => 
  a.name.localeCompare(b.name)
);

/**
 * Filter universities based on a search term (case-insensitive).
 * Matches institution name, acronym, state, or type.
 */
export function filterNigerianUniversities(searchTerm: string): NigerianUniversity[] {
  const clean = searchTerm.trim().toLowerCase();
  if (!clean) return NIGERIAN_UNIVERSITIES;

  return NIGERIAN_UNIVERSITIES.filter((uni) => {
    if (uni.name.toLowerCase().includes(clean)) return true;
    if (uni.acronym && uni.acronym.toLowerCase().includes(clean)) return true;
    if (uni.state.toLowerCase().includes(clean)) return true;
    if (uni.type.toLowerCase().includes(clean)) return true;
    return false;
  });
}
