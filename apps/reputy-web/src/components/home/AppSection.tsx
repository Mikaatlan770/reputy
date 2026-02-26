import { Smartphone } from 'lucide-react'

// TODO: Remplacer ces URLs par les vrais liens App Store / Google Play une fois publiés
const APP_STORE_URL = '#'
const GOOGLE_PLAY_URL = '#'

export function AppSection() {
  return (
    <section id="app" className="py-20 bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-12">

          {/* Left — Text */}
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-900 rounded-full text-sm font-medium mb-6">
              <Smartphone className="h-4 w-4" />
              Application mobile
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-4">
              Gérez votre réputation{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-accent-600">
                où que vous soyez
              </span>
            </h2>

            <p className="text-lg text-gray-600 mb-8 max-w-xl mx-auto lg:mx-0">
              Accédez à votre tableau de bord Reputy depuis votre iPhone ou Android.
              Répondez aux avis, consultez vos statistiques et utilisez l&apos;IA directement depuis votre téléphone.
            </p>

            {/* Badges */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              {/* App Store */}
              <a
                href={APP_STORE_URL}
                className="inline-flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors min-w-[160px]"
                aria-label="Télécharger sur l'App Store"
              >
                {/* Apple logo SVG */}
                <svg className="h-7 w-7 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] leading-tight opacity-80">Télécharger sur</div>
                  <div className="text-sm font-semibold leading-tight">App Store</div>
                </div>
              </a>

              {/* Google Play */}
              <a
                href={GOOGLE_PLAY_URL}
                className="inline-flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors min-w-[160px]"
                aria-label="Télécharger sur Google Play"
              >
                {/* Google Play logo SVG */}
                <svg className="h-7 w-7 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.18 23.76c.37.2.8.2 1.18 0L14.84 12 4.36.24C3.98.04 3.55.04 3.18.24 2.45.64 2 1.39 2 2.21v19.58c0 .82.45 1.57 1.18 1.97zM16.72 9.78l-2.6-2.6 2.03-2.03 2.98 1.67c.85.48.85 1.88 0 2.36l-2.98 1.67-2.03-2.03 2.6-2.6zM5.25 2.03l9.01 9.01-9.01 9.01V2.03z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] leading-tight opacity-80">Disponible sur</div>
                  <div className="text-sm font-semibold leading-tight">Google Play</div>
                </div>
              </a>
            </div>

            <p className="mt-4 text-sm text-gray-400">
              iOS &amp; Android • Gratuit • Accès avec votre compte Reputy
            </p>
          </div>

          {/* Right — Phone mockup */}
          <div className="flex-shrink-0">
            <div className="relative w-64 h-[500px] mx-auto">
              {/* Phone frame */}
              <div className="absolute inset-0 bg-gray-900 rounded-[3rem] shadow-2xl shadow-gray-900/40" />
              {/* Screen */}
              <div className="absolute inset-[3px] bg-gradient-to-br from-primary-900 via-primary-800 to-accent-700 rounded-[2.8rem] overflow-hidden flex flex-col items-center justify-center gap-4 px-6">
                {/* Notch */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-full" />
                {/* App content mockup */}
                <div className="mt-8 text-center">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                    <svg viewBox="80 160 240 65" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-auto">
                      <path d="M86.016 165.703 C 85.258 166.461,85.390 173.225,86.178 174.013 C 86.733 174.568,88.117 174.635,97.604 174.568 C 109.900 174.480,110.750 174.655,113.474 177.837 C 119.472 184.845,114.689 194.457,105.176 194.514 L 102.344 194.531 102.344 196.901 C 102.344 199.699,101.981 200.548,100.064 202.241 L 98.633 203.506 106.270 211.128 L 113.907 218.750 119.427 218.750 C 126.825 218.750,127.216 217.980,122.099 213.487 C 120.710 212.268,117.884 209.445,115.818 207.214 L 112.062 203.158 114.893 201.733 C 130.915 193.665,128.463 170.351,111.117 165.832 C 108.134 165.056,86.773 164.946,86.016 165.703 M255.351 172.905 C 255.201 173.054,255.078 175.257,255.078 177.799 L 255.078 182.422 252.001 182.422 C 248.065 182.422,247.986 182.520,248.129 187.168 L 248.242 190.820 251.637 190.933 L 255.032 191.045 255.153 201.480 C 255.287 213.108,255.381 213.551,258.267 216.265 C 260.563 218.424,261.879 218.852,266.855 219.057 C 273.718 219.340,273.438 219.518,273.438 214.878 C 273.438 210.406,273.566 210.547,269.482 210.547 C 264.681 210.547,264.362 209.778,264.534 198.633 L 264.648 191.211 268.750 191.016 L 272.852 190.820 272.852 186.719 L 272.852 182.617 268.664 182.506 L 264.477 182.396 264.367 177.624 L 264.258 172.852 259.940 172.742 C 257.566 172.681,255.500 172.755,255.351 172.905 M141.447 182.259 C 127.966 185.884,123.213 203.153,132.858 213.463 C 140.072 221.175,153.022 221.564,160.724 214.301 C 162.571 212.559,162.503 212.253,159.732 209.863 C 156.949 207.462,157.036 207.477,154.717 208.966 C 148.348 213.052,141.033 212.034,138.302 206.681 C 136.664 203.470,135.635 203.736,150.581 203.516 L 163.857 203.320 164.384 202.221 C 165.171 200.578,164.350 195.053,162.853 191.915 C 159.117 184.084,149.983 179.963,141.447 182.259 M183.828 182.419 C 182.561 182.824,180.782 183.687,179.876 184.338 C 178.141 185.584,177.734 185.556,177.734 184.193 C 177.734 182.597,172.182 181.579,169.368 182.659 C 168.305 183.067,168.440 233.791,169.506 234.361 C 170.576 234.934,177.071 234.883,177.656 234.297 C 177.993 233.960,178.125 231.372,178.125 225.117 C 178.125 220.326,178.195 216.406,178.280 216.406 C 178.365 216.406,179.756 217.034,181.372 217.801 C 196.853 225.153,212.237 207.643,204.429 191.558 C 200.842 184.167,191.429 179.991,183.828 182.419 M211.198 182.682 C 210.655 183.225,210.918 207.510,211.490 209.658 C 213.839 218.480,225.747 222.515,233.028 216.956 C 235.135 215.348,235.156 215.346,235.156 216.719 C 235.156 218.475,235.764 218.750,239.648 218.750 C 244.574 218.750,244.141 220.501,244.141 200.586 C 244.141 180.551,244.650 182.422,239.193 182.422 C 234.010 182.422,234.375 181.476,234.395 194.873 C 234.410 205.109,234.360 205.921,233.621 207.369 C 231.540 211.447,225.989 212.421,222.465 209.326 C 220.480 207.584,220.317 206.444,220.315 194.316 C 220.313 186.318,220.186 183.233,219.844 182.891 C 219.343 182.390,211.675 182.205,211.198 182.682 M277.051 182.681 C 275.972 183.116,275.872 182.830,283.000 199.609 C 288.470 212.483,290.625 218.025,290.625 219.220 C 290.625 223.164,286.185 226.622,281.865 226.043 C 279.174 225.682,278.906 226.065,278.906 230.273 C 278.906 234.880,278.996 234.952,284.343 234.658 C 293.054 234.178,295.954 231.418,300.555 219.232 C 301.913 215.637,305.612 206.143,308.777 198.135 C 311.941 190.127,314.430 183.316,314.308 182.999 C 314.013 182.229,305.387 182.149,304.792 182.910 C 304.583 183.179,303.080 187.090,301.454 191.602 C 297.060 203.789,296.034 206.347,295.684 205.989 C 295.510 205.810,293.401 200.654,290.998 194.531 C 288.596 188.408,286.452 183.179,286.236 182.910 C 285.845 182.426,278.159 182.233,277.051 182.681 M151.083 190.866 C 152.836 191.889,154.460 193.989,154.901 195.801 L 155.163 196.875 146.331 196.875 C 141.114 196.875,137.500 196.726,137.500 196.510 C 137.500 191.425,145.995 187.895,151.083 190.866 M192.180 191.635 C 199.237 195.476,198.965 206.316,191.721 209.926 C 185.064 213.243,177.617 208.238,177.662 200.476 C 177.707 192.653,185.421 187.956,192.180 191.635 M89.519 204.744 C 86.576 206.201,85.769 207.936,85.603 213.161 C 85.421 218.902,85.283 218.750,90.650 218.750 C 95.966 218.750,95.528 219.795,95.362 207.520 L 95.313 203.906 93.262 203.907 C 91.952 203.907,90.599 204.210,89.519 204.744" stroke="none" fill="white" fillRule="evenodd"/>
                    </svg>
                  </div>
                  <p className="text-white font-semibold text-lg">Reputy</p>
                  <p className="text-white/60 text-xs mt-1">Tableau de bord</p>
                </div>
                {/* Mini stats mockup */}
                <div className="w-full space-y-2">
                  {[
                    { label: 'Note moyenne', value: '4.8 ★' },
                    { label: 'Avis ce mois', value: '+24' },
                    { label: 'Taux de réponse', value: '96%' },
                  ].map((stat) => (
                    <div key={stat.label} className="flex justify-between items-center bg-white/10 rounded-xl px-3 py-2">
                      <span className="text-white/70 text-xs">{stat.label}</span>
                      <span className="text-white text-xs font-semibold">{stat.value}</span>
                    </div>
                  ))}
                </div>
                {/* Home indicator */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-24 h-1 bg-white/40 rounded-full" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
