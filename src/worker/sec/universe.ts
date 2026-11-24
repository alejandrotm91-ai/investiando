// Universo de la capa SEC: las 300 mayores empresas del S&P 500 por capitalización.
// Lista aproximada (noviembre de 2026): capitalización de Yahoo sobre los grandes valores de EE. UU.
// del índice; la composición exacta del S&P 500 cambia y no se publica en EDGAR. Los tickers que no
// están aquí (carteras y watchlists de usuarios) se cargan bajo demanda la primera vez que se piden.
//
// prev: CIK anteriores de la misma empresa. ExxonMobil pasó a una sociedad holding nueva en 2026 y
// su historial de 10-K/10-Q sigue en el CIK antiguo de Exxon Mobil Corp. Igual BlackRock (holding
// nueva en 2024; antes "BlackRock Inc.", hoy BlackRock Finance).

export interface UniverseEntry {
  ticker: string;
  cik: number;
  prev?: number[];
}

export const SEC_UNIVERSE_AS_OF = "2026-11-24";

export const SEC_UNIVERSE: UniverseEntry[] = [
  { ticker: "NVDA", cik: 1045810 }, // NVIDIA Corporation
  { ticker: "AAPL", cik: 320193 }, // Apple Inc.
  { ticker: "MSFT", cik: 789019 }, // Microsoft Corporation
  { ticker: "GOOGL", cik: 1652044 }, // Alphabet Inc.
  { ticker: "AMZN", cik: 1018724 }, // Amazon.com, Inc.
  { ticker: "AVGO", cik: 1730168 }, // Broadcom Inc.
  { ticker: "TSLA", cik: 1318605 }, // Tesla, Inc.
  { ticker: "META", cik: 1326801 }, // Meta Platforms, Inc.
  { ticker: "LLY", cik: 59478 }, // Eli Lilly and Company
  { ticker: "BRK-B", cik: 1067983 }, // Berkshire Hathaway Inc.
  { ticker: "WMT", cik: 104169 }, // Walmart Inc.
  { ticker: "MU", cik: 723125 }, // Micron Technology, Inc.
  { ticker: "JPM", cik: 19617 }, // JPMorgan Chase & Co.
  { ticker: "AMD", cik: 2488 }, // Advanced Micro Devices, Inc.
  { ticker: "V", cik: 1403161 }, // Visa Inc.
  { ticker: "XOM", cik: 2115436, prev: [34088] }, // ExxonMobil Holdings Corporation
  { ticker: "JNJ", cik: 200406 }, // Johnson & Johnson
  { ticker: "MA", cik: 1141391 }, // Mastercard Incorporated
  { ticker: "ABBV", cik: 1551152 }, // AbbVie Inc.
  { ticker: "COST", cik: 909832 }, // Costco Wholesale Corporation
  { ticker: "CVX", cik: 93410 }, // Chevron Corporation
  { ticker: "PLTR", cik: 1321655 }, // Palantir Technologies Inc.
  { ticker: "KO", cik: 21344 }, // The Coca-Cola Company
  { ticker: "CSCO", cik: 858877 }, // Cisco Systems, Inc.
  { ticker: "ORCL", cik: 1341439 }, // Oracle Corporation
  { ticker: "PG", cik: 80424 }, // The Procter & Gamble Company
  { ticker: "MRK", cik: 310158 }, // Merck & Co., Inc.
  { ticker: "UNH", cik: 731766 }, // UnitedHealth Group Incorporated
  { ticker: "BAC", cik: 70858 }, // Bank of America Corporation
  { ticker: "GE", cik: 40545 }, // GE Aerospace
  { ticker: "HD", cik: 354950 }, // The Home Depot, Inc.
  { ticker: "INTC", cik: 50863 }, // Intel Corporation
  { ticker: "PM", cik: 1413329 }, // Philip Morris International Inc.
  { ticker: "AMAT", cik: 6951 }, // Applied Materials, Inc.
  { ticker: "PANW", cik: 1327567 }, // Palo Alto Networks, Inc.
  { ticker: "LRCX", cik: 707549 }, // Lam Research Corporation
  { ticker: "MS", cik: 895421 }, // Morgan Stanley
  { ticker: "TXN", cik: 97476 }, // Texas Instruments Incorporated
  { ticker: "CAT", cik: 18230 }, // Caterpillar Inc.
  { ticker: "RTX", cik: 101829 }, // RTX Corporation
  { ticker: "GS", cik: 886982 }, // The Goldman Sachs Group, Inc.
  { ticker: "DELL", cik: 1571996 }, // Dell Technologies Inc.
  { ticker: "NFLX", cik: 1065280 }, // Netflix, Inc.
  { ticker: "TMO", cik: 97745 }, // Thermo Fisher Scientific Inc.
  { ticker: "WFC", cik: 72971 }, // Wells Fargo & Company
  { ticker: "CRWD", cik: 1535527 }, // CrowdStrike Holdings, Inc.
  { ticker: "AMGN", cik: 318154 }, // Amgen Inc.
  { ticker: "GEV", cik: 1996810 }, // GE Vernova Inc.
  { ticker: "LIN", cik: 1707925 }, // Linde plc
  { ticker: "IBM", cik: 51143 }, // International Business Machines Corporation
  { ticker: "AXP", cik: 4962 }, // American Express Company
  { ticker: "ANET", cik: 1596532 }, // Arista Networks, Inc.
  { ticker: "GILD", cik: 882095 }, // Gilead Sciences, Inc.
  { ticker: "ADI", cik: 6281 }, // Analog Devices, Inc.
  { ticker: "APH", cik: 820313 }, // Amphenol Corporation
  { ticker: "KLAC", cik: 319201 }, // KLA Corporation
  { ticker: "C", cik: 831001 }, // Citigroup Inc.
  { ticker: "DIS", cik: 1744489 }, // The Walt Disney Company
  { ticker: "ABT", cik: 1800 }, // Abbott Laboratories
  { ticker: "BLK", cik: 2012383, prev: [1364742] }, // BlackRock, Inc.
  { ticker: "PEP", cik: 77476 }, // PepsiCo, Inc.
  { ticker: "VZ", cik: 732712 }, // Verizon Communications Inc.
  { ticker: "MCD", cik: 63908 }, // McDonald's Corporation
  { ticker: "CRM", cik: 1108524 }, // Salesforce, Inc.
  { ticker: "UNP", cik: 100885 }, // Union Pacific Corporation
  { ticker: "DE", cik: 315189 }, // Deere & Company
  { ticker: "NEE", cik: 753308 }, // NextEra Energy, Inc.
  { ticker: "WELL", cik: 766704 }, // Welltower Inc.
  { ticker: "COP", cik: 1163165 }, // ConocoPhillips
  { ticker: "QCOM", cik: 804328 }, // QUALCOMM Incorporated
  { ticker: "PFE", cik: 78003 }, // Pfizer Inc.
  { ticker: "TMUS", cik: 1283699 }, // T-Mobile US, Inc.
  { ticker: "DHR", cik: 313616 }, // Danaher Corporation
  { ticker: "ISRG", cik: 1035267 }, // Intuitive Surgical, Inc.
  { ticker: "ACN", cik: 1467373 }, // Accenture plc
  { ticker: "SCHW", cik: 316709 }, // The Charles Schwab Corporation
  { ticker: "ETN", cik: 1551182 }, // Eaton Corporation plc
  { ticker: "TJX", cik: 109198 }, // The TJX Companies, Inc.
  { ticker: "LMT", cik: 936468 }, // Lockheed Martin Corporation
  { ticker: "T", cik: 732717 }, // AT&T Inc.
  { ticker: "BX", cik: 1393818 }, // Blackstone Inc.
  { ticker: "CB", cik: 896159 }, // Chubb Limited
  { ticker: "BA", cik: 12927 }, // The Boeing Company
  { ticker: "UBER", cik: 1543151 }, // Uber Technologies, Inc.
  { ticker: "SPGI", cik: 64040 }, // S&P Global Inc.
  { ticker: "PGR", cik: 80661 }, // The Progressive Corporation
  { ticker: "IBKR", cik: 1381197 }, // Interactive Brokers Group, Inc.
  { ticker: "WDC", cik: 106040 }, // Western Digital Corporation
  { ticker: "COF", cik: 927628 }, // Capital One Financial Corporation
  { ticker: "BMY", cik: 14272 }, // Bristol-Myers Squibb Company
  { ticker: "MO", cik: 764180 }, // Altria Group, Inc.
  { ticker: "MDT", cik: 1613103 }, // Medtronic plc
  { ticker: "PLD", cik: 1045609 }, // Prologis, Inc.
  { ticker: "LOW", cik: 60667 }, // Lowe's Companies, Inc.
  { ticker: "PH", cik: 76334 }, // Parker-Hannifin Corporation
  { ticker: "SBUX", cik: 829224 }, // Starbucks Corporation
  { ticker: "SYK", cik: 310764 }, // Stryker Corporation
  { ticker: "MPC", cik: 1510295 }, // Marathon Petroleum Corporation
  { ticker: "ADP", cik: 8670 }, // Automatic Data Processing, Inc.
  { ticker: "BKNG", cik: 1075531 }, // Booking Holdings Inc.
  // Del puesto 101 al 300 (lista del S&P 500 con capitalización de Yahoo, noviembre de 2026)
  { ticker: "CVNA", cik: 1690820 }, // Carvana
  { ticker: "VRTX", cik: 875320 }, // Vertex Pharmaceuticals
  { ticker: "MRVL", cik: 1835632 }, // Marvell Technology
  { ticker: "APP", cik: 1751008 }, // AppLovin
  { ticker: "MCK", cik: 927653 }, // McKesson
  { ticker: "STX", cik: 1137789 }, // Seagate Technology
  { ticker: "CME", cik: 1156375 }, // CME Group
  { ticker: "SO", cik: 92122 }, // Southern Company
  { ticker: "MAR", cik: 1048286 }, // Marriott International
  { ticker: "NEM", cik: 1164727 }, // Newmont
  { ticker: "ABNB", cik: 1559720 }, // Airbnb
  { ticker: "CVS", cik: 64803 }, // CVS Health
  { ticker: "DUK", cik: 1326160 }, // Duke Energy
  { ticker: "HCA", cik: 860730 }, // HCA Healthcare
  { ticker: "SNDK", cik: 2023554 }, // Sandisk
  { ticker: "EQIX", cik: 1101239 }, // Equinix
  { ticker: "MRSH", cik: 62709 }, // Marsh McLennan
  { ticker: "BNY", cik: 1390777 }, // BNY Mellon
  { ticker: "REGN", cik: 872589 }, // Regeneron Pharmaceuticals
  { ticker: "FTNT", cik: 1262039 }, // Fortinet
  { ticker: "ICE", cik: 1571949 }, // Intercontinental Exchange
  { ticker: "WM", cik: 823768 }, // Waste Management
  { ticker: "MMM", cik: 66740 }, // 3M
  { ticker: "NOW", cik: 1373715 }, // ServiceNow
  { ticker: "GD", cik: 40533 }, // General Dynamics
  { ticker: "GLW", cik: 24741 }, // Corning Inc.
  { ticker: "PSX", cik: 1534701 }, // Phillips 66
  { ticker: "UPS", cik: 1090727 }, // United Parcel Service
  { ticker: "CSX", cik: 277948 }, // CSX Corporation
  { ticker: "VLO", cik: 1035002 }, // Valero Energy
  { ticker: "PWR", cik: 1050915 }, // Quanta Services
  { ticker: "USB", cik: 36104 }, // U.S. Bancorp
  { ticker: "TT", cik: 1466258 }, // Trane Technologies
  { ticker: "WAT", cik: 1000697 }, // Waters Corporation
  { ticker: "CTAS", cik: 723254 }, // Cintas
  { ticker: "CEG", cik: 1868275 }, // Constellation Energy
  { ticker: "CMCSA", cik: 1166691 }, // Comcast
  { ticker: "MSI", cik: 68505 }, // Motorola Solutions
  { ticker: "ADBE", cik: 796343 }, // Adobe Inc.
  { ticker: "EMR", cik: 32604 }, // Emerson Electric
  { ticker: "HWM", cik: 4281 }, // Howmet Aerospace
  { ticker: "PNC", cik: 713676 }, // PNC Financial Services
  { ticker: "SPG", cik: 1063761 }, // Simon Property Group
  { ticker: "MRNA", cik: 1682852 }, // Moderna
  { ticker: "ECL", cik: 31462 }, // Ecolab
  { ticker: "KKR", cik: 1404912 }, // KKR & Co.
  { ticker: "SHW", cik: 89800 }, // Sherwin-Williams
  { ticker: "MDLZ", cik: 1103982 }, // Mondelez International
  { ticker: "CDNS", cik: 813672 }, // Cadence Design Systems
  { ticker: "AMT", cik: 1053507 }, // American Tower
  { ticker: "MNST", cik: 865752 }, // Monster Beverage
  { ticker: "MCO", cik: 1059556 }, // Moody's Corporation
  { ticker: "JCI", cik: 833444 }, // Johnson Controls
  { ticker: "RCL", cik: 884887 }, // Royal Caribbean Group
  { ticker: "ELV", cik: 1156039 }, // Elevance Health
  { ticker: "SNPS", cik: 883241 }, // Synopsys
  { ticker: "WMB", cik: 107263 }, // Williams Companies
  { ticker: "HLT", cik: 1585689 }, // Hilton Worldwide
  { ticker: "TRV", cik: 86312 }, // Travelers Companies (The)
  { ticker: "ITW", cik: 49826 }, // Illinois Tool Works
  { ticker: "CL", cik: 21665 }, // Colgate-Palmolive
  { ticker: "NOC", cik: 1133421 }, // Northrop Grumman
  { ticker: "TGT", cik: 27419 }, // Target Corporation
  { ticker: "RSG", cik: 1060391 }, // Republic Services
  { ticker: "EOG", cik: 821189 }, // EOG Resources
  { ticker: "ORLY", cik: 898173 }, // O'Reilly Automotive
  { ticker: "INTU", cik: 896878 }, // Intuit
  { ticker: "FDX", cik: 1048911 }, // FedEx
  { ticker: "VRT", cik: 1674101 }, // Vertiv
  { ticker: "FCX", cik: 831259 }, // Freeport-McMoRan
  { ticker: "CI", cik: 1739940 }, // Cigna
  { ticker: "NSC", cik: 702165 }, // Norfolk Southern
  { ticker: "AJG", cik: 354190 }, // Arthur J. Gallagher & Co.
  { ticker: "HON", cik: 773840 }, // Honeywell Technologies
  { ticker: "AON", cik: 315293 }, // Aon plc
  { ticker: "DASH", cik: 1792789 }, // DoorDash
  { ticker: "ROST", cik: 745732 }, // Ross Stores
  { ticker: "AEP", cik: 4904 }, // American Electric Power
  { ticker: "APO", cik: 1858681 }, // Apollo Global Management
  { ticker: "GM", cik: 1467858 }, // General Motors
  { ticker: "SLB", cik: 87347 }, // Schlumberger
  { ticker: "KMI", cik: 1506307 }, // Kinder Morgan
  { ticker: "APD", cik: 2969 }, // Air Products
  { ticker: "KMB", cik: 55785 }, // Kimberly-Clark
  { ticker: "ALL", cik: 899051 }, // Allstate
  { ticker: "GWW", cik: 277135 }, // W. W. Grainger
  { ticker: "MPWR", cik: 1280452 }, // Monolithic Power Systems
  { ticker: "NXPI", cik: 1413447 }, // NXP Semiconductors
  { ticker: "COR", cik: 1140859 }, // Cencora
  { ticker: "DLR", cik: 1297996 }, // Digital Realty
  { ticker: "URI", cik: 1067701 }, // United Rentals
  { ticker: "HPE", cik: 1645590 }, // Hewlett Packard Enterprise
  { ticker: "CAH", cik: 721371 }, // Cardinal Health
  { ticker: "TDG", cik: 1260221 }, // TransDigm Group
  { ticker: "MET", cik: 1099219 }, // MetLife
  { ticker: "AFL", cik: 4977 }, // Aflac
  { ticker: "PSA", cik: 1393311 }, // Public Storage
  { ticker: "CRH", cik: 849395 }, // CRH plc
  { ticker: "BSX", cik: 885725 }, // Boston Scientific
  { ticker: "TEL", cik: 1385157 }, // TE Connectivity
  { ticker: "DDOG", cik: 1561550 }, // Datadog
  { ticker: "HOOD", cik: 1783879 }, // Robinhood Markets
  { ticker: "EW", cik: 1099800 }, // Edwards Lifesciences
  { ticker: "FAST", cik: 815556 }, // Fastenal
  { ticker: "TRGP", cik: 1389170 }, // Targa Resources
  { ticker: "D", cik: 715957 }, // Dominion Energy
  { ticker: "BDX", cik: 10795 }, // Becton Dickinson
  { ticker: "NDAQ", cik: 1120193 }, // Nasdaq, Inc.
  { ticker: "CMI", cik: 26172 }, // Cummins
  { ticker: "TFC", cik: 92230 }, // Truist Financial
  { ticker: "O", cik: 726728 }, // Realty Income
  { ticker: "NUE", cik: 73309 }, // Nucor
  { ticker: "PCAR", cik: 75362 }, // Paccar
  { ticker: "DAL", cik: 27904 }, // Delta Air Lines
  { ticker: "IDXX", cik: 874716 }, // Idexx Laboratories
  { ticker: "GRMN", cik: 1121788 }, // Garmin
  { ticker: "ADSK", cik: 769397 }, // Autodesk
  { ticker: "AME", cik: 1037868 }, // Ametek
  { ticker: "AZO", cik: 866787 }, // AutoZone
  { ticker: "OKE", cik: 1039684 }, // Oneok
  { ticker: "OXY", cik: 797468 }, // Occidental Petroleum
  { ticker: "XEL", cik: 72903 }, // Xcel Energy
  { ticker: "EBAY", cik: 1065088 }, // eBay Inc.
  { ticker: "ETR", cik: 65984 }, // Entergy
  { ticker: "SRE", cik: 1032208 }, // Sempra
  { ticker: "KDP", cik: 1418135 }, // Keurig Dr Pepper
  { ticker: "NKE", cik: 320187 }, // Nike, Inc.
  { ticker: "BE", cik: 1664703 }, // Bloom Energy
  { ticker: "A", cik: 1090872 }, // Agilent Technologies
  { ticker: "LITE", cik: 1633978 }, // Lumentum
  { ticker: "KEYS", cik: 1601046 }, // Keysight Technologies
  { ticker: "VMRK", cik: 906107 }, // Vivmark Residential
  { ticker: "HONA", cik: 2089271 }, // Honeywell Aerospace
  { ticker: "FERG", cik: 2011641 }, // Ferguson Enterprises
  { ticker: "FANG", cik: 1539838 }, // Diamondback Energy
  { ticker: "WAB", cik: 943452 }, // Wabtec
  { ticker: "EXC", cik: 1109357 }, // Exelon
  { ticker: "LHX", cik: 202058 }, // L3Harris
  { ticker: "DVN", cik: 1090012 }, // Devon Energy
  { ticker: "F", cik: 37996 }, // Ford Motor Company
  { ticker: "HUM", cik: 49071 }, // Humana
  { ticker: "VTR", cik: 740260 }, // Ventas
  { ticker: "PYPL", cik: 1633917 }, // PayPal
  { ticker: "FITB", cik: 35527 }, // Fifth Third Bancorp
  { ticker: "CMG", cik: 1058090 }, // Chipotle Mexican Grill
  { ticker: "BKR", cik: 1701605 }, // Baker Hughes
  { ticker: "VYLR", cik: 2128626 }, // Vylor
  { ticker: "ROP", cik: 882835 }, // Roper Technologies
  { ticker: "MSCI", cik: 1408198 }, // MSCI
  { ticker: "XYZ", cik: 1512673 }, // Block, Inc.
  { ticker: "YUM", cik: 1041061 }, // Yum! Brands
  { ticker: "ED", cik: 1047862 }, // Consolidated Edison
  { ticker: "STT", cik: 93751 }, // State Street Corporation
  { ticker: "VEEV", cik: 1393052 }, // Veeva Systems
  { ticker: "ARES", cik: 1176948 }, // Ares Management
  { ticker: "AMP", cik: 820027 }, // Ameriprise Financial
  { ticker: "LYV", cik: 1335258 }, // Live Nation Entertainment
  { ticker: "CARR", cik: 1783180 }, // Carrier Global
  { ticker: "COHR", cik: 820318 }, // Coherent Corp.
  { ticker: "WDAY", cik: 1327811 }, // Workday, Inc.
  { ticker: "VST", cik: 1692819 }, // Vistra Corp.
  { ticker: "ROK", cik: 1024478 }, // Rockwell Automation
  { ticker: "AIG", cik: 5272 }, // American International Group
  { ticker: "IQV", cik: 1478242 }, // IQVIA
  { ticker: "PRU", cik: 1137774 }, // Prudential Financial
  { ticker: "FIX", cik: 1035983 }, // Comfort Systems USA
  { ticker: "PAYX", cik: 723531 }, // Paychex
  { ticker: "KR", cik: 56873 }, // Kroger
  { ticker: "SYY", cik: 96021 }, // Sysco
  { ticker: "DHI", cik: 882184 }, // D. R. Horton
  { ticker: "TTWO", cik: 946581 }, // Take-Two Interactive
  { ticker: "WEC", cik: 783325 }, // WEC Energy Group
  { ticker: "BIIB", cik: 875045 }, // Biogen
  { ticker: "EL", cik: 1001250 }, // Estée Lauder Companies (The)
  { ticker: "CIEN", cik: 936395 }, // Ciena
  { ticker: "CCL", cik: 815097 }, // Carnival Corporation
  { ticker: "CBRE", cik: 1138118 }, // CBRE Group
  { ticker: "PEG", cik: 788784 }, // Public Service Enterprise Group
  { ticker: "MLM", cik: 916076 }, // Martin Marietta Materials
  { ticker: "CBOE", cik: 1374310 }, // Cboe Global Markets
  { ticker: "GEHC", cik: 1932393 }, // GE HealthCare
  { ticker: "HIG", cik: 874766 }, // Hartford (The)
  { ticker: "TER", cik: 97210 }, // Teradyne
  { ticker: "FOXA", cik: 1754301 }, // Fox Corporation (Class A)
  { ticker: "VMC", cik: 1396009 }, // Vulcan Materials Company
  { ticker: "OKTA", cik: 1660134 }, // Okta, Inc.
  { ticker: "ACGL", cik: 947484 }, // Arch Capital Group
  { ticker: "UAL", cik: 100517 }, // United Airlines Holdings
  { ticker: "ODFL", cik: 878927 }, // Old Dominion
  { ticker: "TKO", cik: 1973266 }, // TKO Group Holdings
  { ticker: "HSY", cik: 47111 }, // Hershey Company (The)
  { ticker: "CCI", cik: 1051470 }, // Crown Castle
  { ticker: "MTD", cik: 1037646 }, // Mettler Toledo
  { ticker: "EXR", cik: 1289490 }, // Extra Space Storage
  { ticker: "NTAP", cik: 1002047 }, // NetApp
  { ticker: "RMD", cik: 943819 }, // ResMed
  { ticker: "P", cik: 1474432 }, // Everpure
  { ticker: "MCHP", cik: 827054 }, // Microchip Technology
  { ticker: "ZTS", cik: 1555280 }, // Zoetis
  { ticker: "ADM", cik: 7084 }, // Archer Daniels Midland
];
