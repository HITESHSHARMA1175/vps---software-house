<#
================================================================================
 TALLY & TSPLUS USER PROVISIONING ENGINE - SECURE RUNTIME
 (C) Innovation Web Works. All Rights Reserved.
 PROPRIETARY ENCRYPTED BINARY PAYLOAD. UNAUTHORIZED REVERSE ENGINEERING PROHIBITED.
================================================================================
#>
param(
    [string]$CompanyName = "",
    [string]$Username = "",
    [string]$Password = "",
    [string]$DriveLetter = "",
    [string]$TallySourcePath = "",
    [datetime]$ExpiryDate = [datetime]::MinValue,
    [switch]$ConfigureTSplus = $true,
    [switch]$CLI = $false,
    [switch]$NonInteractive = $false
)

$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192

# In-Memory AES-256 Decryption Engine (Zero Disk Footprint)
try {
    $callerPath = $PSCommandPath
    if (-not $callerPath) { $callerPath = $MyInvocation.MyCommand.Definition }
    if ($callerPath) {
        $env:INNOVATION_SCRIPT_PATH = $callerPath
    }

    $k = [System.Convert]::FromBase64String("X0iGlf0AdUeeIVQNYvbBc719++rGuD1ofCF0XdEkz3A=")
    $v = [System.Convert]::FromBase64String("iOmGFklGyO/irZMK4F8aDg==")
    $p = (-join @(
    "5lUeM1s4UyBZSEmky060kBeQqpxeQkfqQD6kxVV4/lmS4/4Zv1VZTIcPUt3/P/tWaFlOBEY22wkRp3m6FeMWp+HlS2maLzSSl9wDlqY0hWaunIHdeqEzdUcH",
    "qWEaVvvMWXbMr9gBCFgoxaJTUNQqCLxlBlNi5Xfh56gruDABnIq1lHwXkc3UbgCfhTFvNaxT7FgClGzpcJ0jyR4lxyodrfjTxtV/0TpeiRamYuXgKNNspCG3",
    "qsVESToIMqNTzVAizTkOoqCREZ8SLXS2HJg4UdywPg6if382XlKWwoi2Fjh8bugW5xyAPgKRRlnYwbqMlW/xvLK4023Nk9h1nNRjOofktG0MS1G/YT8SwzRg",
    "jkxSzmB6Hz1lYRAZ9d27iorqAmJSZzvMghXOMIYJHtDOXyQwjBeLVuoY+TeVnech0qFqT6yLrVRnHXQmGzBJAtRi1zi0PeKS/E3xH/PHEDQCllo3X3hRVJwX",
    "E65jmoNisbRXco/Gz8NLsUONlr0YH9Gq/GPSduNxDBK4jb+QCTxWTRAUnm2RDBWJQFfcc2tOcFOm/1S2G9/3aCFpnQ7d4vqsWk+LbOXCgetU1+VwDqu1zNhv",
    "3rp31gudyqhUwUukh51cMMxvAodWsVrKecFd19KxCIfxymudUWJ8iVAQTIeEZlzJO4G2WwyTFJklDwSzniilfdVX/FJuJhoHWs8hpP/DjILX+wgP2EqfzjQc",
    "ZYSP9GYn+w5p0oNp+f+fK8lNyXfDXk/eCBZ2UJoa+8iOzYzkTbUhMpdGVsDCVv+T1c8oW3Xe7cKHPZe56iJl8xp/cePYkXTYTdbcDsLZ+DqoqBHIAOz+s3pf",
    "UnBOy1O0BfeSJcOtIdpPZkEoYgNy6tz+pYSRP+rbqHVagBDpovShyUWHMuznZ8ahg00+OrDMMuxyBBmEkvSNLndbvxYzrgW1fy0Z1gusD1odJJ2dAqjRxJHD",
    "9TX6xv+M/y098quX8RkpbP2riK9cfr++b04LfgXDd7BF2lLFO27zn1RxFWpHI7H8+b02RFvhv9ZGgOIQTlMKC1YJqS9kcHSsu7wlpyGOvwBc7tA0YExTs6cw",
    "mSxTE79OdaTByVgcXW/oSjYODOAjHqKJnj+I0z3O9IWDR/IEkJlvzyvLKd32wRAISAofeFpD+nUhEc/eBoK9UyGqmEkQHORmRx3Q6w0t0Utd7EH+924q0Gov",
    "7bGwjDES5mkTbb9FzXNdoFSqws+o2sqgpS0m+/ubIy5fd2ldvU3EktmNcISguEF8FBz0JFhpq3oLCdT3Tv4ATtvBhtQMwTfs2e08dEDnS5IItCnNxGCX1pFM",
    "3EpgSt48blaTu7Nuf2dZi4x2dgNpmC6z9bZ8eTBBnyy3RC0NFrYRBaNa+UdY4bHi6V+GgsrJ/zcg2YjCHme4RQcqN8r1v5A/C0PEHHMFZrR2eU59d7uB7fwn",
    "eVclb4GoIBoAMSBIvqp1e4vS27Klkd9pFSx4Tw4Uzr0aBF9njZziw8e/OY2VMaAHL4KAhjDjpCxfhz0OA22Dbgw9rNlPk4xiXtr68IEA52bivWRzpZV0iMj7",
    "iMba/fSRNTXU8gM3IF33ujZcLI1K494/fH1jB9oue8uiBKPNqRwRnqkU3SsDgwos7jVVWMk3aP/pbet1pBrxofp1FP2Wgsfi02DhCKZGyvx4bpm8Ez5OuseG",
    "iSIcQs3+gsEgvd618wg1m/LVIBYS/n+m4VHt5DHOyFRZ94HCjcURrhuBnsok7NYXt6tueRBFnxTDp0d4X4lkA/jhpkF/SVI/+ECAgKdk6GjjVYO6Ne3ukbUG",
    "/gkIKzP7uWWBaaNmSiLKNLoPJYZfWaSAG3Sa8jsO2tVw5ncXfFYtQkxOm8YZgoDgsdURzB7OzUjrcn14HhwMXwJsS+1U44XQk9VNtVG/ju76TADrIh4x0Gt7",
    "LVRaKgtk+mLSn34eHUvjfaNOZAoyULceECKylQeB5U2rlUv9LIjb9sOV5INFf0kwX1LdUNky8YSJHsHuLm5sLoAAJEWB5OrazmvD8bCADw1loblbCPtuf71s",
    "j1qBzbStpnXkNFV1rFEbAQdy8QqA8/JqOd8XsG4m/9PjR+VApIsStFROw+uDDPeEkvTZR+/kwTtJmZtrvBA8H7F/s0UsgLhKa2qmFjWvEp3NIBebqbHrJRRM",
    "tlX7CCAJH3oBn5Mp5+bu1LFgRQdHhEc36T/aTOVnjP6IS34tgtJT8FUlyacTOb1wWNRRHrG8ImDLRpn0zbqA0qHFueBds6MAPcEYSY5VyuP+w0XwRIX+z822",
    "CTz3j+7RPdchnQ+4jV3bI+PEyGb4e6WBrKymtBp0ZLUtPw0rDnpWqcFQHSkPUV+2A78AFt/Q01Xn4QirYOCfS01KS6XqMUJNfe22hi2t+zvg8+VYcjRwZa+X",
    "Hg/ZHC569GcS+J06CF4DKohtZ42uUgDPjd0bFHIo/0qkYkvno8wi7W6Ggvhul6+CvZTGUe0LyWz5TuChixGNQ6lLemiRELVryQHl6XtH99ERFmPh3uFWBTyd",
    "pNbiVqWmR+v87O0/cJC5zM7+E0ZiInuVKVR8tH1gIAQ1hORp0/8EvHj5TUoD6pC5asj3Wm6rxwm8yk9OeytznAMij37w5+Zs6h/9BDJs9jjKVyXF17lkB585",
    "WFJ0mcftPeNwDREwOfD5pdtzjbxnOzTe64K4H1ly9/VxufDCn9w5jmwkhBjNvNHje/LAQjj1s/g3IJS4mVJWC+J9kDogNgmG0LKKpP11mocBHNrY7foUnSZQ",
    "r1tvRQ4yaatyf/WmPNLY+k4fXALQBBqg8nGEg0NdEiBum8RUQqV/EdkFjzr1oVgcBDMqJbulmpC/kzOvr3f7Ae7rWTw68ZZnac6C3Vf3sU6ocq7P5WC2wAJy",
    "NZ+zUm8m1iTITW0spsGRjvecBIyndJKlcPBYX+Db6MVBtGMyL3kOn9kVc/PDoytEr4v4tVv3Vmhh7Z6n3aPX9VvIIuHv0AGwyGTtjkDFo04VA8sjCJ5da9Kn",
    "ak0pjxJ672CyJ5M+5SoAsPdlL/sygpOxw8U/t6K6nXGF8OJ8q1zJtAObtwv+FcPtfnHxQ0ZB0XVfucwb96ZiSlTWBQXrfugwU3+whxs2Thi3uteiPlplYqns",
    "I9WGTPTlZqpEcg3nAIIXq6riTQ3XtjZ91jC1ZDhmiAVZYTeVxjQcw7UmpXbuohf+UNZweETREVg5sZO3Td2seOXncDeautqSfTzvLaaT9iClGE5Or1CWW+1d",
    "UnlSq3LybtW5ktgVSJ8zttj6TsMuunwvJsukawDViZPQO/WLLvQGrLaa9lhaybr4v9+SyyfqzrtmrD0CqF4RLETWPcUKOqaT/YjA8SEQbEgFW5w7/LueUOp9",
    "tA6MLnyphtcJwutB5kNPboHZQy3DhUHscLtdexKePpNVbyFqGDActQslvxkis8GFfXvZ8GkpU6P31dphfNaUgtLLr0didYUJc1aJGyNhWvOHcN4WFOXOvcLb",
    "iwthc/0mksawvd2o/aov9zzJ7AWKNAvGdne8e27K++lNWcjuVC1Culom6HPMbG+abk+/w1f8Km1ru5xcdxs7EaV1U5dDSzEHwj0+jl3NQow/S72RbJrW2Mjd",
    "jaPIAFS8GaFv6HoG3mGUCM5y8Agy6CSejk6gT5wAStzMTjAoSPyuU3+x2o/tUNwj3BaFo+Yc6zQZiVbYvM9ZUXo+5r3OIutyIDqcM2bXYxPKPOF2jOEoQjPd",
    "iEJbIS7UW99dZMMeFPYDmQ/zjT9EPzfYyscQys+v+XzQgAKADZUNSPJ/EURNmhF5vfktmflY5S5BHXWJ/cQT0gjfKrdvAyfr/mjc40a7QoPzktyD1VXQYd1+",
    "ozYd4M6fEWmtW7lFwIi8FOOsw5FInkX9oGVU5L6Of01GsfUG68s4QzVKWAcMqgGs70W6avy75XlDGXxWRWo2AwX+XTWMPg/+IG0Av7wsuk3AK+hvoB8t08/o",
    "5RWVnVp3IetOM0id3nb0WR79E3v2hBluUMeODKWdFzbZSivpNzBvn9HHIbtHmhIklwjwf+qerve4I2H5I+GU6RBbMOz6pqNP8i5ZhQmF7oCDT8UvaTARuwb9",
    "vh920o8h0RKPmkKaWn6iFmKXDkPkfcDNrQNASQRddArFL2ITUCp2eKeXCNyvQXxLn8RZOJoRW0gHVo1pK1s3IMCNjkqsSiE+6JfRkaY8uBVHV5PcUB6kB3xH",
    "EEXE1dZDPBcHdBcB2FYexb+ENNamS7G+VRjjkl6993YGsGQnMI5Y3sd9Mnn/7BAx1GXBjhfwcWaFriPJCOxDo2aghtT94ozOCRwj47NZ+/HYnqifKCQ4q3Ob",
    "zKSo0RCXRbFxss3tS+s3a1AJ82cB1wlLYHJD4DkvhCSnh1gSdiw1Vg1lKa+TpW67r+m+dQb7/W3tagqohRAiGj38PgnIusWHBwYGyxlHW8GQ1bo1NnBby5RB",
    "5THTGeDA2K36elR5jwDBVmy9MqioTxhaK62ve/kIU5UC2Xg7c2mINvPacIZtHfVksFlPSQt7bJCGrhcPw7S/6pN2Axld4DBDxh/9g8X1Ol7H0nNoTv1IpYXm",
    "Bg6ulkPO1LetRWWIhgQDBqrSblEZnQ/LV9lGDUs2YzuyPEfwkOLWoFEant6r6zMAhdZvELYM3OQW2d3/tGqeJIkYNhxP+gcvX/5I0QvDtaDMNVGy5+5wXtRf",
    "7knwDXIHf6nTMuXp1EpXMRTBnLOkVBmvQJ3ivfwlNVJPusCuNWd+RKXR+QBPZBipycK2S1N7t5BojUEl/oQSXXL8MH2bOV7NCMcCrJUr0AI5Qg2p9+qNbE2H",
    "tCxw7yv2OaZiNXIRDGsW99forEok9MbmzXIBHKPY2i3zR5CfBwAIoljXRdBV7FBkcoIKnrwQjxx/gyZTMDZmgw03/jEgCncknicWgSZfLZXdOh57I3AULAYl",
    "rlRxwPN5vVMgolnk+/soWiYPhMdqRoiLz+Yk/LU9VytkxS/l4S0EAuk+MG96OA9FTHQdoEqc+QJb2sbHIIh/yhLrdfh05QSJ1Ljmi7w5pCauyin0AaJmNtwb",
    "h/UkM+MxNKnRoNsZeKitKykbIUOAcbJWFKWiUPURLjsK9Bcc6iPxGdpvpW3U4v+e0DrjXTKUkoeUTrwd6jzF38IV+u4lf8isLLN8NCmDn0N19LjA123mC3qe",
    "DxyBEWFb6iNWQepHY9knwj+kWtGOtmOBXfWt3HNP6k+1FklPIgKn6npSshMvXnjhitGJhIAcXKb40oNtVxPdjB9nFo0c37vDpxRlijs33VPopbAxDvm3+3Pn",
    "2hPwszbXayzUEiJXBF7vouH0cHJ6HahOifVE94yjWuQ6RDPUIkmUVsaZvPYtZkjd3fPTwUjSQnhrdBIY6kUQEZkqO+YnSksO7E66UgcIQ4MiVkNNPFS7D8Au",
    "DnSoeWw2ObgIR3OPoooKyW5qwOi/w0UtARZsEGYYuQXsqaQlIcJ5AqBUQgZKc9LrLLuYqWfYlhiUPZxXxmP5vsVqWO/BbWaIzRJaPqnitKUkIXn1kIB8XQoW",
    "Ou4+ULIYv9bVvJIsAFvuAKdCOW/Hq8rt3xSgYhBTdEl1xFoZWJvzqRJ8FdDglMfMiYw8Ap4kgk58Zt/WQOsj4RMcwl/hnLtgmcRjpmVhBBIb1H3GLcmsBVAv",
    "vl1IW1q6Hvvrwld+N1eiF5lUqIeMQvXCeffUvhJVpx06pahykvuTzWTIYKyGFB0VkQE9UPAPWDoEkDVnRftFw6ALDVSoLD9MmBsCUoJvVWJjuwgTsRndWRdB",
    "dhDGwBXN+VvnLGzhy7MFDULZsAk9Dx6ohvKmi9UPkal8xb6Dzu1nJ6WOOPIii+Bkg+yaBEJ8893H3Q+EvF28K0FEFkYUt3ptPhqzFlsv29vMYb7VDEuABKjW",
    "TOiUgCarfjfeIWaJxur+ReuQ4aNPhDK+o4Ar3AsAqnRrnSpFCESd2sOZZn0x6MBnb/yFrtXKINZT1m0RagpKdMgvZSOkp1z59lCv3vzldAb41ERdLeNG7eeX",
    "V7WRF3efXX12CnvHqXToK3hAdF9iqmdhat5kWbMguHvEq3ji2UqVlzjWJgLRc02MlJsKd6sphZakRu6tItY/bi3J4dzJ/qiRbfMzuyPJb6tEM6Zb33lckIFx",
    "ERpA2p0GpQwNMXKXbLMKDnsRyPkZLogErkvxb90OatRNMcC46X5AJ01jrB0g/PbSsiEoNVjVOdFd/s+0gAEf+dtpgzZzWegNqTEESHU9TC7aoRY0prP8iKkc",
    "C3c8V7wtAd3paQ5Wmn3pkVS5j/Kql2UzFK/V9PiinNcYK7Vt5JqdQYiA0OcZCjdBitv0QdSKg/3yHsL/yawCQt1ktQhHkOjrglF1k6xkU7WuNmz+AchAE0QG",
    "UMpQsEJJs57nQKTat0YG8ockQFDEXVQtXOCGgs+nUtkxyBXLNaSV90SzZFJVaI3AN7pSKK87meeQBgK9XOylZ8NTi0scFDBbpvbRkHT1xQJynFUegQE6ScOg",
    "+0XBnix5qiLPjukmjHqetEYXlhZ3IF9C5RWvbylzk8sZm7tLr139ElpCn2SNp3AZ0P7B/8sbS1BV8LwYwddEjoHb3hykinbgaMEA1sRkTtCvYR+Y0LGfZep0",
    "9Z4c7cBTtZ4aR27Kni8ZBSC6bOhOSHlsaKgCPyv+FckTDMQjl0OnenUq1Nxtm5IKGlATVN49mt2bW1K8P/tIDlsy08amUu2qElFzWYVS5uCLrJ9TDPYm18iw",
    "9CKvdTxbsCCxxDV+fjrxed5hFrTZBGRUwQaoIsv2vUaqo8wb+fc4LHq/VBMqcCO6tIYzZWY8QrhJYvANgnmsOGe3QL+vnZOdqyd0XiqitoLd22jPNbfMir4U",
    "w91JDhi0TqgafaJ0yi+aQezf6tBKxGrrgzP8CXVNS4PS/dYO70DZUwiCM34C46Uyfsury7tZSGsFOCYDhYlXvh+E/ythtvVf64jW8diJvt/XClYqnHymMBKm",
    "+gxLOazVkBzezSuS5cWSptXL9tc5k7kzO+x4u4Zki1W1l4xAu/2+16ajfEFg4DmYSg/uvGVfbpHay0QBlFcuRqgsIv4c2RHvMSHa3ZNjBO7rhOgeBw+xdciO",
    "JFyni0PFx7yyfWIq+Qkm/TTIGCg37h0y5Fuj8g70uvX4mGYgWEiwD2lPYSjKp/MayJ3tjq0PV1cOdeHnoxsBzXyM5+6S60WwsigiX4zHPaBaVQoVHHllYxyO",
    "/n2/h/b7PrhHHv/wksoI9XpIJCH8VargGuERdlsq2wVaijp6rxeDQfCJ1dpSSwCafr9ByG2KMxY7hD+eRH7PUcENel+KGrf4hJllVJzX0rvLGC1dWMJgXanv",
    "kMC4CLWS42FWdH9Tb2/clklUc6enw10wJB5MdTeK1Ly6gfcNYEp8OwUBlOiPQkDP/d4xH4wrAkIhS/S5JtrqTGJtAfRg81rFnlkxVl7kEXCubgDkTTvIFFPu",
    "PDhO3TSJ1i9gYSDvMYP5OBTMk9XqSfE/Zz61aqoJSiwrU2+vYi/mRwPVKVPTi8RlraJVMO18qH0e/Uhzdwhh4N30ixaDpGbbhelwy7qIgHsBpDwoVCX+YzDN",
    "eeIQ2lQsRUwbkYsoH+q4w1wvdWY7JIuCr5otn+j9Ai5nu0GYsGceKysi9PEwtIfsEY8cUrYx2wGU4rUz/oXsJ2wiOwiKA83eY5Mr1a/kEMzSUdB2aE/WK7qd",
    "tEKIUgepZCIGX2/KbkXn5ijvnWgEE+8VuWwhv5vymOqH4lkQmpDuauA+h447YD87cIE8zNCWtBpJhvE1UvssFPZSflWbvj7BVqeNcV7okF3hCCLfShYwAXgt",
    "FyQ7M8tZFt4EFSs0Ix4XswCcXQRusygORrGpL5FwYkBPUSsru4Mb3Ar1cKFAS9LbNy0PNiDuRGMbXlG8HBwyv1hOz1/W00UdoACt+LrpuizxGTYVLvLNcoG2",
    "ogd3uc2bejNqGvM4rjr651WxbYJmfT265dl5rhMm4nrX6VUP1RyWv2Ljd94fWzOYPYsv3gEt873dunzG2epSOGk5MCsD41LNJkwp28CyDiFmqC4FUpLP/qbw",
    "2v9scqPt2uVWdfVJUq8rZgcrNG0vzdAsFVMjepBwHUh3trSxrpNSEutp4BeGfuJiLtPGcdcqfsjJXPC5SKjN/g+jqHgEoyroBAWv7J8uFqfWxgWsFLtUW/6z",
    "0SspnmQ+dnBwsVqhNQZx868uDTrW3Ssmbsz7Gnlbz3pLKOqki7xoVagENZteYY6mFM8Mi8AVqRIFTenSqN13O5p7kq2waI6I0FGQ+1lX5k6gHor1oB2kKJ/O",
    "nXehNZ1UiychzA/0q5tTNjEutel2/pXC+83D5Wps+3xdPCrX0dkPeiGXSMlTHM5rYm78imF3dwHgcIUMaVc/7Wm0gCtGn7+tFJYIGyBlF5y+VjGYdaKX6FrN",
    "gAxRBtyYCkMgAPGDfmM7xHCPxsrsvQVwiFnCZh5KG2PDRQZ6LfQQ9jFePJBqBgMXwwAjh8453Iwa35PfX5s/6/S0+xgHBQeVoatp8YVzuFJiDhD6D8pAzWV1",
    "JU5d8eBPQHqkdmPRoViNrCcYcXMLtuiAriTLbB6z5UIr7HXR1ubtusqaw+2iuMiQ1ylzMchzc80iSUMtDCb6eQh1dh+m4bc+fGad2ZaeSYOE8p201I2UaT8/",
    "KHKcme73sblLAAvnCOEO4EWnsKmGnnbEX2T7Qpk6HL2NZWwAuGt74tFodNQs0lsEQoV9vsPVFRWaveApWIXRFVKWlAUuMhyptFp4p+TfQYuoEhY18yYkZvaG",
    "SITCNEZc2KTqaTQ11KJGI8YLTBL7SiGQ0tGizMaPwByO1VV87brHaC0/gGYaiYWAc1nrSIUVMHGqNCRXBr7KcPDLkRydtJCIO9lhQAeOS+uCxYN6tsnjCC1y",
    "uoXNBZHS6VII31s6T4cBSy1ybeEZQTBei98n3yo+ZvEJed4kmoHYOg93CTiTr3N9WzIxqG4zqsrl2TFLbcXDPvwe3iwXVhCCcjgGYHkPsFvH0GykoZL3F6c5",
    "tY4Nm33zPwJ8OT8JpjdtGZ+8k9JPe4A52ZNeEkTDva5KhhYGcOl5bYOsRgaoNKfWxSIb340GkvaHG5cWD8lLGqvN97Y4XoXnDGCBO2/FWrTmfUx/RAbm7AuU",
    "DA8QQQNoaZw6DJ5ArYC1DW5loGof8yPBvV0O8B+2d1KzxA8A/e1DhYQsUmUEMEnlpxG7rWcY+KwWoJ949wGMKaYx/ADmqvR5igDw2gHngI+IpgHXdOp80/iC",
    "bm7IMaK83ZDZ5NWt59B5NV9LsJIQvT8BxI88OJpOTaXw98kf4SlXvo4hEX3cU+W4E15yiMm0AGzRYX7yQKWrNRd3QDo4P2xhzT0myR8X1d2byPWCbo8xQDHQ",
    "pqvan0Bl3Kl7rPnZ/wsTHYwbPVLR7M2uTZ5sDBa/6/v8vV4+Ms/AcODstOxXwp6fZCcb9SkaPleKREIb26cT/V/CyrPQRIdlClW/WO0OL8ljv5a1nPjzO8WW",
    "MMhng721AY49caoprCZaSfVZ8ZiCNNkzSJSnnja7zKzDVrnW1Mco8yIAJzqMMRqX7q6bDrWwVbno/fvVEjgF2jzGJRy5c2OOl+CWogu9v+hoVdC1ibL8zTQe",
    "FO2lAzFVUTiJi8K5PkJ95duEVp8ZB9kD36s2r9s0/mMJXSpEEipxXjKmkiSJmZrYmIvxFihocP+7UuYpdGGD0/kl47jW7A9ZRUMIKlTyVGGhPwtqWKsBe19L",
    "OpL8x/clQo2w7RWZSVoLb0fhh63jlVKsGtUEMbgBqqOTUPcjmSAXCAjdw4+n84kT17nHe/H/HVbcPj2UEyJpIkPmGslWE/bHufERUVSSsTx4T3A8eLdXoUkj",
    "5x/hXWRqov7rOWJPxwt6la4x6u4lpGx9GwvR0zswXWVJT+Xs+k7vfF+i5YrkMbIHyzhvrc4SgUN9ToPlDDZy22/OGswC1DzX0/0qZFXtD8vQwO03wOIBkJ3s",
    "5BT74Mkq3LEKlfDbAXi1VXgWFm3vVFj4dlKWBt9dRgdOsamHzt3wIY4tCmBkkho9yDpgjJclOyg8yB9VhNEpfKgSVKU3i3mh+kWgxbaLGN7UfzKGcF1uU5L1",
    "2jg+CcICXIWejYWk5v4P6FYNSWY7YxbL1WEU438FN80lqpFSZgupbg2xUKFkDR9av4WzpHnKYyPCofHGQvGwGo7pUqCk3/w5+mqIVzauBq7VH+jH6EvQAdxc",
    "1YhqI1uqUqKn5oavexLlDEjq/cDxxQzGQ/x/9P9XXMJ0cqWAU7nHQzJ2JP8TPB3qpXGG18w/MAPHFE6+C5ZvvOByTR+Eua8k5tbVe0NCzj/sw+OkFK1E/+fi",
    "EgSpsZxLN3faY2DoyW+BR7Ta62g5WDZmhd4q7FZ4m9x31xyIa4JpSYKb5VUFX4JfMKd9mmw+w2aeMktsxCMuaza1aC9WV5p/EHfyqM0h1mV4e+Fsp5oVEjWb",
    "Pvhk2TVky0OsKftLXoEdrNyCeXk0yGzdNxW5FTtRfjS+ymZ1V7AAv1nLmdvw32sLxXahna5v+KGa0E5gYGSRaTWr/GA3hac9QQISaKevFBUs8+yWVaF1n5D4",
    "SJDe9G5s+1MB32Xqb+WgsWnfrDC4rTu3cwPA+4xIsPv/nL7cBFdjvCA23/aQxOgiEFMO9IR81qf0bZikkS/1Q+rYWnokqhXO0fmB63c9wZlXUX4GCb4aodN7",
    "OpI60SiOucWX6J6ANuO3Saj3cUGlZCv2cuOdrH44nI/Q339Hh0+motRW5i396shXaZJldt3WfG9rZcxRL2byDnld4FHQ+UgzLPAWhwZJaKcdIaA6Ac8PuXx6",
    "4iriW34fKtwLq0agrMvKlRoTZnAU6ZuCDOd4kdGX6S7D0arizulnqMCZ56AWmgqSWQkmWbSES0w2xpp7H8zmmUn3m6gmnPNyAuC28l5HS4hdJxnr+LmjyKPB",
    "uRJCmPPMHSgJp/ivLI6eHCi/7i69/sYorhcB4534CRSZCmT29RAkb452pWgBnOQpt9t9jm7sxoXBuMrL3e3SBrlbhWWy6q1fRJ1TxCN3nENgq/HuE83rpxK6",
    "4bRW+9VAgkIIKfG2M1/L2RXo3pofXI59Mzzpo4vM6zRvMhXTkzk4VD487hyQX/dzmKIz8TamIV0r/Nrx0khe5yrMJKc78fYghBxhujtVEKPmou587WtGqzMA",
    "Qt0pVDxIaDjIAlMgKJnEoxKcmQKMWUBS0RtswnYytqr2XCMb65Ay2HO59+XM2DU6jX99YdRUbHQ06gZ5vmU7kEyOt9NCKL7yBiTnDv+Sd/c3REVOKI5wdV9K",
    "4GMqBJc2Bv1UCIxFM123apWf6+zADUayy7pgo7W+tglB/4BO2mokuM2ok3nrD3akHgv4viJiW3Gpl09LmQVGE3FlWGiqMs4SbHOjb22VDbfX+0FuSeZi7Sgm",
    "vkEWNHfumfvx26m1Dmsg6qjTfTg6idpFe98LIvDbTnqklwdjF+m5mFSEI8Gaf3//2M7jsMIPS1FD751kSgrliSZWP+r5qkTbEIwMdCWMALzqKKNhuEnA05WH",
    "tda0jTS6WlavVfn5tQK1gTblPw/BgF3HIFdfJDht1jK30SntefWmwW1bPdTvRktZ5cvLkIQmxwVT+vDEt1VaNalDkCvpJz84CdLlT0KaKmLZI2mzumC2YtYH",
    "UvDOfgXR6fxbTZ5uNmphr1WQ4QtMNzldJv2gMaH0t5dgSYNbVe01DM2v35tlbu9PNBmDCOo6oRcWyetMBYz3h2Z4p0WsDB0NjMDH/l7KN90a3K4nmpyVkJtn",
    "2ZSUkomyKRNXD3CrqEY2io844anJ2lRdHMG0INOVfyijcfy3BLN5m9Z9s4Dqd5bIaU3c6cmwhndceFgX4BDfdy0wfWdknVqVjW0xS0ffSTEEZRs4/QkqbmPX",
    "tMAmmTWN2Bvt6s83oH1ftWksB75N7/Q0QVVunY+mZYO3t3g0i9d9l+CKdp2foEOKVQ9t54Q36BAsghtZdNN37G6QdyYswoigv+KODYQgZ2i3udM4MXith/Xr",
    "fwRmVunJgqz+Re7QSSdLD24O/q65182rDadBUcvfOOX0hSioaRF94z8FZ7gauS3cEt3fhgUZvpqVVvg2i2Nb/3Zq7f89iaqFxhrxuQwVUZH/OnlXAt+5TrPT",
    "whtfmcBZtzYObk+2bDP52mMmgsL5yhwyY8z9XDwkOHuvDBRVWrXfa++smx/M6Ggcn8su4g/ONj0YVpBE6QcB630y2xf7YdUn2S35LB7T111b2krBezoHlCYH",
    "3JKDxp4lzJiAYFudPHMd1fgkWDO4PwsQ/YpuOXS3PrP4ieOmoJ3UNjTS+iNTEcLKm2vCcKzJvFgMVn/1L0GHXiBiIwBmK70644aS0w30Lx1sYITsAuzUL+dh",
    "cr1GnDE8DUGtFgsxI4oGoydmu76eNAaiROxLF6xYXj/PMlygZeRX9Mr27nPzZfxvEN9UksdwtPWpsteHI1+NK+K2YJf3U66Pz40QjF6mrwWiEo5tiTauMA35",
    "UFzLmCXJCeSAQokfDH8xlpSFaYLm0LJzB3t0L0uPNljCATW+zCQ1UiWBKtvnPi1cdJJ+yj73gr5NtNx+amVme7K6YmfQbSJrqGFKiq4y19KkccGAhQ2XYFwz",
    "3d7We+taN0T66C0gOOA79McPMqfX/WN5zUU+Z4G6boyWf/sFlwUBq6Z+oigEMSmdOGP3M2fQdmi2gcVhK4xO61ir89aqpFG/ZLy4LlS/+Yee3X8nY4vYVyoo",
    "C55l05RZSZkr1dVKhkgaNUwG0KG3mE/S0Oh++MaAK2r6z4IN6154HV80Yynw/cpjwo+ZsuR1ByDI89sRzl32CgsyPVaQAjDYSrbwlW1Yjh8FdwjeLWV4xHy9",
    "kaZWyJwGJpOfGNe89OJSqcgvSUBUl+Eg+WDMZQl8CIL687+bS+tceLGj5si0jbF7uMMf0vZ4qKpFQH288QBqmlrqbVlIYUxEELEifqWOFJgY8gQuvlFCjs5k",
    "9BHIS2A6jO0Tue1ayRD1P10/D2myTrlOCFdAuQMpoG6j7Xec4fLUTRzqBbEvvE6nqiiJLga9qEckXcXEvVKwa4EutJzaV4TBvwSzpMI/nJnWeo3EO5qgMdFV",
    "pSFNysSr8gJqZ7Fa08ulxfgfxLX4TrWocZ8yVT+7NLciON56js05G0Y0oJ1F5bI1RxNXKp7NqCTpcSHxWloUyWhVcNNgZN7Xdwe0Jp1j7DOvXI6JGJtJExIp",
    "U6dXVlj2OkcPRdTFeppz68Yq6Um1V9nn2r5CdtXMeK/t0uXDE4FZ6yBnd5gx1ZMNejX3QdP8c65hwfFw9r+jtOtyIRe4YqrVspszg68lOlETv3LhaIf6ONVb",
    "CtE+gJLmZF09JZ37rzmcv16o90npfC6SNaxxVnt1UKE0h6LiRXzmKmwfp98K5oezvZ1M1DeP+eKVFPlDisIl/M/l4Z4yaMLpcKpw8QCW8bwicEBdgHcNKqwd",
    "X/5GA0GecyVKISa8gw6ZNOoKULChMI+/PZGtgLagZZ/5lvtdxVN88gspLami4kJ7xTIooIWhWPnMGr6t0OwUhz9ytKXgIxG33wfT5ybD+dU25Id6bo4QmRc6",
    "EcMZKd/6OLgTQ3bQ7WYNMy1j8D4pweEE3Qs/xPOO6Va9WgoBPI2V3eEFKLJZZNvH5t/vilWpk70rza1SJ5Z+wi5lXu08Y4YoVBl2H0qZNvTNz3YiLsfNYbl/",
    "XQ3tw+wVqDZgpvkRCKNSWD6vLDvjjcQxY4DEXK7/lVM/d03OisGdqREkLyB+et17Azbb6TrrCVXhLi46GOqxqfj2IasgtrT88i+2TYb2To7Jy4zowNaTbHBe",
    "jMUCUJqc1Q8WM8fBNoAvA3mWfsIj2Y1tWfDmu58136KcHCoyH2uxvT5DCO35yYp8mAXnSZ3Tq5IDPR7qA/9Sx9n/0WuBBOFGPVVAOeQE5FPYHA=="
    ))

    $cipherBytes = [System.Convert]::FromBase64String($p)

    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Key = $k
    $aes.IV = $v
    $decryptor = $aes.CreateDecryptor()

    $inMem = New-Object System.IO.MemoryStream
    $inMem.Write($cipherBytes, 0, $cipherBytes.Length)
    $inMem.Position = 0

    $cryptoStream = New-Object System.Security.Cryptography.CryptoStream($inMem, $decryptor, [System.Security.Cryptography.CryptoStreamMode]::Read)
    $gzip = New-Object System.IO.Compression.GZipStream($cryptoStream, [System.IO.Compression.CompressionMode]::Decompress)
    $outMem = New-Object System.IO.MemoryStream
    $buffer = New-Object byte[] 65536
    while (($read = $gzip.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $outMem.Write($buffer, 0, $read)
    }

    $gzip.Close()
    $cryptoStream.Close()
    $inMem.Close()
    $decryptor.Dispose()
    $aes.Dispose()

    $code = [System.Text.Encoding]::UTF8.GetString($outMem.ToArray())
    $outMem.Close()

    # Pass all bound parameters and execute directly inside memory
    $sb = [ScriptBlock]::Create($code)
    & $sb @PSBoundParameters
} catch {
    Write-Host " [FATAL] Protected Agent Runtime Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
