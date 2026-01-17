import Link from 'next/link'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gray-50 border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Logo & Description */}
          <div className="col-span-2 md:col-span-1">
            <svg viewBox="80 160 240 65" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-auto mb-4">
              <path d="M86.016 165.703 C 85.258 166.461,85.390 173.225,86.178 174.013 C 86.733 174.568,88.117 174.635,97.604 174.568 C 109.900 174.480,110.750 174.655,113.474 177.837 C 119.472 184.845,114.689 194.457,105.176 194.514 L 102.344 194.531 102.344 196.901 C 102.344 199.699,101.981 200.548,100.064 202.241 L 98.633 203.506 106.270 211.128 L 113.907 218.750 119.427 218.750 C 126.825 218.750,127.216 217.980,122.099 213.487 C 120.710 212.268,117.884 209.445,115.818 207.214 L 112.062 203.158 114.893 201.733 C 130.915 193.665,128.463 170.351,111.117 165.832 C 108.134 165.056,86.773 164.946,86.016 165.703 M255.351 172.905 C 255.201 173.054,255.078 175.257,255.078 177.799 L 255.078 182.422 252.001 182.422 C 248.065 182.422,247.986 182.520,248.129 187.168 L 248.242 190.820 251.637 190.933 L 255.032 191.045 255.153 201.480 C 255.287 213.108,255.381 213.551,258.267 216.265 C 260.563 218.424,261.879 218.852,266.855 219.057 C 273.718 219.340,273.438 219.518,273.438 214.878 C 273.438 210.406,273.566 210.547,269.482 210.547 C 264.681 210.547,264.362 209.778,264.534 198.633 L 264.648 191.211 268.750 191.016 L 272.852 190.820 272.852 186.719 L 272.852 182.617 268.664 182.506 L 264.477 182.396 264.367 177.624 L 264.258 172.852 259.940 172.742 C 257.566 172.681,255.500 172.755,255.351 172.905 M141.447 182.259 C 127.966 185.884,123.213 203.153,132.858 213.463 C 140.072 221.175,153.022 221.564,160.724 214.301 C 162.571 212.559,162.503 212.253,159.732 209.863 C 156.949 207.462,157.036 207.477,154.717 208.966 C 148.348 213.052,141.033 212.034,138.302 206.681 C 136.664 203.470,135.635 203.736,150.581 203.516 L 163.857 203.320 164.384 202.221 C 165.171 200.578,164.350 195.053,162.853 191.915 C 159.117 184.084,149.983 179.963,141.447 182.259 M89.519 204.744 C 86.576 206.201,85.769 207.936,85.603 213.161 C 85.421 218.902,85.283 218.750,90.650 218.750 C 95.966 218.750,95.528 219.795,95.362 207.520 L 95.313 203.906 93.262 203.907 C 91.952 203.907,90.599 204.210,89.519 204.744" stroke="none" fill="#242c34" fillRule="evenodd"/>
            </svg>
            <p className="text-sm text-gray-500">
              La réputation qui inspire confiance.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-sm text-gray-900 mb-4">Produit</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/features" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Fonctionnalités
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Tarifs
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-sm text-gray-900 mb-4">Entreprise</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Se connecter
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Créer un compte
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-sm text-gray-900 mb-4">Légal</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/legal/privacy" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Confidentialité
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  CGU
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-400 text-center">
            © {currentYear} Reputy. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  )
}
